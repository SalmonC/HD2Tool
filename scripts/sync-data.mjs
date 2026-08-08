import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "reports/data-sync-report.json");
const sourceCatalogPath = resolve(root, "src/data/source/catalog-source.json");
const generatedCatalogPath = resolve(root, "src/data/catalog.json");
const assetManifestPath = resolve(root, "src/data/assets/manifest.json");
const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const wikiApi = valueFor("--wiki-api");
const wikiQuery = valueFor("--wiki-query") ?? "Helldivers 2";
const sourceCatalog = JSON.parse(await readFile(sourceCatalogPath, "utf8"));
const generatedCatalog = JSON.parse(
  await readFile(generatedCatalogPath, "utf8"),
);
const assetManifest = JSON.parse(await readFile(assetManifestPath, "utf8"));
const report = {
  generatedAt: new Date().toISOString(),
  mode: "development-only",
  catalogWrite: false,
  steam: { candidates: [], manifest: null, buildId: null, status: "not-found" },
  filediver: {
    status: "not-run",
    path: valueFor("--filediver") ?? process.env.HD2_FILEDIVER_PATH ?? null,
    note: "本项目不复制 filediver 代码；请在本机提供固定版本的 BSD-3-Clause 工具并记录校验和。",
  },
  wiki: {
    status: wikiApi ? "pending" : "not-requested",
    query: wikiQuery,
    candidates: [],
    note: "Wiki 结果只能进入候选报告，不会自动生成中文正式名、价格或页码。",
  },
  changes: [],
  imageCandidates: [],
};

function comparableItem(item) {
  if (!item || typeof item !== "object") return item;
  const { image: _image, search: _search, ...rawFields } = item;
  return rawFields;
}

const sourceItems = new Map(
  (sourceCatalog.items ?? []).map((item) => [item.id, item]),
);
const generatedItems = new Map(
  (generatedCatalog.items ?? []).map((item) => [item.id, item]),
);
const itemIds = new Set([...sourceItems.keys(), ...generatedItems.keys()]);
for (const id of [...itemIds].sort()) {
  const sourceItem = sourceItems.get(id);
  const generatedItem = generatedItems.get(id);
  if (!sourceItem) {
    report.changes.push({ kind: "generated-only", id });
    continue;
  }
  if (!generatedItem) {
    report.changes.push({ kind: "source-only", id });
    continue;
  }
  const fields = new Set([
    ...Object.keys(comparableItem(sourceItem)),
    ...Object.keys(comparableItem(generatedItem)),
  ]);
  const changedFields = [...fields].filter(
    (field) =>
      JSON.stringify(comparableItem(sourceItem)[field]) !==
      JSON.stringify(comparableItem(generatedItem)[field]),
  );
  if (sourceItem.image?.path !== generatedItem.image?.path)
    changedFields.push("image.path");
  if (changedFields.length > 0)
    report.changes.push({
      kind: "changed",
      id,
      fields: [...new Set(changedFields)].sort(),
    });
}
report.imageCandidates = (assetManifest.assets ?? [])
  .filter((asset) => asset.status === "candidate")
  .map((asset) => ({
    path: asset.path,
    sourceRefs: asset.sourceRefs,
    verificationStatus: "pending",
  }));

const configuredSteamPath = valueFor("--steam-path");
const steamRoots = [
  configuredSteamPath,
  process.env.HD2_STEAM_PATH,
  process.env.STEAM_PATH,
  process.env.ProgramFiles
    ? resolve(process.env.ProgramFiles, "Steam")
    : undefined,
  process.env["ProgramFiles(x86)"]
    ? resolve(process.env["ProgramFiles(x86)"], "Steam")
    : undefined,
].filter(Boolean);

// Steam may keep the client and the game in different library roots. When a
// client root is supplied, discover every library listed in libraryfolders.vdf
// before checking the app manifest. This is intentionally read-only.
for (const steamRoot of [...steamRoots]) {
  const libraryFile = resolve(steamRoot, "steamapps/libraryfolders.vdf");
  if (!existsSync(libraryFile)) continue;
  const libraryConfig = await readFile(libraryFile, "utf8");
  for (const match of libraryConfig.matchAll(/"path"\s+"([^"]+)"/gi)) {
    const libraryRoot = match[1].replaceAll("\\\\", "\\");
    if (!steamRoots.some((entry) => resolve(entry) === resolve(libraryRoot)))
      steamRoots.push(libraryRoot);
  }
}

for (const steamRoot of steamRoots) {
  const manifestPath = resolve(steamRoot, "steamapps/appmanifest_553850.acf");
  if (!existsSync(manifestPath)) continue;
  report.steam.candidates.push(manifestPath);
  const manifest = await readFile(manifestPath, "utf8");
  report.steam.manifest = manifestPath;
  report.steam.buildId = /"buildid"\s+"(\d+)"/i.exec(manifest)?.[1] ?? null;
  report.steam.status = report.steam.buildId
    ? "manifest-found"
    : "manifest-without-build-id";
  const installDir = /"installdir"\s+"([^"]+)"/i.exec(manifest)?.[1];
  if (installDir) {
    report.steam.installDir = resolve(
      dirname(manifestPath),
      "common",
      installDir,
    );
  }
  break;
}

if (report.filediver.path) {
  report.filediver.status = existsSync(report.filediver.path)
    ? "tool-found-not-run"
    : "path-not-found";
}

if (wikiApi) {
  try {
    const url = new URL(wikiApi);
    if (url.protocol !== "https:") throw new Error("Wiki API 必须使用 HTTPS。");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", wikiQuery);
    url.searchParams.set("format", "json");
    url.searchParams.set("srlimit", "20");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "HD2-Supply-Book-sync/0.1 (development report)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    report.wiki.status = "candidate-report";
    report.wiki.candidates = (payload.query?.search ?? []).map((entry) => ({
      pageId: entry.pageid,
      title: entry.title,
      sourceUrl: `${url.origin}/wiki/${encodeURIComponent(entry.title.replaceAll(" ", "_"))}`,
      verificationStatus: "pending",
    }));
  } catch (error) {
    report.wiki.status = "error";
    report.wiki.error = error instanceof Error ? error.message : String(error);
  }
}

await mkdir(resolve(root, "reports"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote development sync report: ${reportPath}`);
console.log(
  `Steam: ${report.steam.status}; Wiki: ${report.wiki.status}; catalogWrite=${report.catalogWrite}`,
);
