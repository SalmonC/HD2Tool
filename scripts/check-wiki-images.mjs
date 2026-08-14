import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "src/data/catalog.json");
const manifestPath = resolve(root, "data/wiki-image-manifest.json");
const api = "https://helldivers.wiki.gg/api.php";
const accept = process.argv.includes("--accept");
const noLoadoutIcon = new Map([
  ["cqc-72-entrenchment-tool", "map pickup; no callable stratagem"],
  ["sg-88-break-action-shotgun", "map pickup; no callable stratagem"],
]);

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "HD2Tool image maintenance/0.1" },
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 300),
        );
    }
  }
  throw lastError;
}

function fileTitleFromUrl(url) {
  const marker = "/wiki/File:";
  const index = url?.indexOf(marker) ?? -1;
  if (index < 0) return undefined;
  return `File:${decodeURIComponent(url.slice(index + marker.length)).replaceAll("_", " ")}`;
}

async function discoverLoadoutIcon(item) {
  if (!item.wiki?.pageId) return undefined;
  const url = `${api}?action=parse&pageid=${item.wiki.pageId}&prop=text&format=json&formatversion=2`;
  const parsed = await fetchJson(url);
  const html = parsed.parse?.text ?? "";
  const match = html.match(/File:([^"'<>]+Stratagem[^"'<>]+(?:svg|png))/i);
  if (!match) return undefined;
  return `File:${match[1].replaceAll("_", " ")}`;
}

async function mapLimited(values, limit, mapper) {
  const result = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      result[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return result;
}

async function imageInfo(fileTitles) {
  const result = new Map();
  for (let offset = 0; offset < fileTitles.length; offset += 50) {
    const batch = fileTitles.slice(offset, offset + 50);
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "sha1|timestamp",
      titles: batch.join("|"),
      redirects: "1",
      format: "json",
      formatversion: "2",
    });
    const query = await fetchJson(`${api}?${params}`);
    const aliases = new Map();
    for (const entry of query.query?.normalized ?? [])
      aliases.set(entry.from, entry.to);
    for (const entry of query.query?.redirects ?? [])
      aliases.set(entry.from, entry.to);
    for (const page of query.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      result.set(
        page.title,
        info ? { sha1: info.sha1, timestamp: info.timestamp } : null,
      );
    }
    for (const requested of batch) {
      let resolved = requested;
      const seen = new Set();
      while (aliases.has(resolved) && !seen.has(resolved)) {
        seen.add(resolved);
        resolved = aliases.get(resolved);
      }
      if (result.has(resolved)) result.set(requested, result.get(resolved));
    }
  }
  return result;
}

const candidates = catalog.items
  .map((item) => ({
    equipmentId: item.id,
    purpose: "catalog-image",
    fileTitle: fileTitleFromUrl(item.image?.filePage),
    assetPath: item.image?.path,
  }))
  .filter((entry) => entry.fileTitle);

const supportItems = catalog.items.filter(
  (item) => item.productKind === "support-weapon",
);
const discovered = await mapLimited(supportItems, 6, async (item) => ({
  equipmentId: item.id,
  purpose: "loadout-icon-watch",
  equipmentPageId: item.wiki?.pageId,
  sourceField: "rendered-infobox-file",
  fileTitle: await discoverLoadoutIcon(item),
}));
for (const entry of discovered) if (entry.fileTitle) candidates.push(entry);

const infoByTitle = await imageInfo([
  ...new Set(candidates.map((entry) => entry.fileTitle)),
]);
const currentEntries = candidates
  .map((entry) => {
    const info = infoByTitle.get(entry.fileTitle);
    return {
      ...entry,
      remoteSha1: info?.sha1 ?? null,
      remoteTimestamp: info?.timestamp ?? null,
    };
  })
  .sort((left, right) =>
    `${left.purpose}:${left.equipmentId}`.localeCompare(
      `${right.purpose}:${right.equipmentId}`,
      "en",
    ),
  );

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  manifest = undefined;
}

const keyOf = (entry) => `${entry.purpose}:${entry.equipmentId}`;
function validateEntries(entries, label) {
  if (!Array.isArray(entries))
    throw new Error(`${label}: entries must be an array`);
  const keys = new Set();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (keys.has(key)) throw new Error(`${label}: duplicate key ${key}`);
    keys.add(key);
    if (!entry.fileTitle?.startsWith("File:"))
      throw new Error(`${label}: invalid file title ${key}`);
    if (!/^[0-9a-f]{40}$/.test(entry.remoteSha1 ?? ""))
      throw new Error(`${label}: invalid or missing SHA-1 ${key}`);
  }
}

validateEntries(currentEntries, "current Wiki state");
const catalogEntries = currentEntries.filter(
  (entry) => entry.purpose === "catalog-image",
);
if (
  catalogEntries.length !== catalog.items.length ||
  new Set(catalogEntries.map((entry) => entry.equipmentId)).size !==
    catalog.items.length
)
  throw new Error("current Wiki state: catalog image coverage is incomplete");

const unexpectedMissingIcons = discovered.filter(
  (entry) => !entry.fileTitle && !noLoadoutIcon.has(entry.equipmentId),
);
if (unexpectedMissingIcons.length)
  throw new Error(
    `current Wiki state: loadout icon discovery failed for ${unexpectedMissingIcons.map((entry) => entry.equipmentId).join(", ")}`,
  );

if (manifest) {
  if (manifest.version !== 1 || manifest.source !== api)
    throw new Error("image manifest: unsupported version or source");
  validateEntries(manifest.entries, "image manifest");
}

const baseline = new Map(
  (manifest?.entries ?? []).map((entry) => [keyOf(entry), entry]),
);
const current = new Map(currentEntries.map((entry) => [keyOf(entry), entry]));
const changes = [];
for (const [key, entry] of current) {
  const previous = baseline.get(key);
  if (!previous)
    changes.push({ status: "NEW", key, fileTitle: entry.fileTitle });
  else if (previous.fileTitle !== entry.fileTitle)
    changes.push({
      status: "REFERENCE_CHANGED",
      key,
      before: previous.fileTitle,
      after: entry.fileTitle,
    });
  else if (previous.remoteSha1 !== entry.remoteSha1)
    changes.push({
      status: "CONTENT_CHANGED",
      key,
      fileTitle: entry.fileTitle,
      before: previous.remoteSha1,
      after: entry.remoteSha1,
    });
}
for (const [key, entry] of baseline)
  if (!current.has(key))
    changes.push({
      status: "MISSING_OR_UNREFERENCED",
      key,
      fileTitle: entry.fileTitle,
    });

if (accept) {
  if (!manifest)
    console.log(
      "No previous image baseline; accepting the reviewed initial state.",
    );
  else if (changes.length) console.log(JSON.stringify(changes, null, 2));

  const removals = changes.filter(
    (entry) => entry.status === "MISSING_OR_UNREFERENCED",
  );
  if (removals.length) {
    console.error("Refusing to remove existing image watches during accept.");
    process.exit(1);
  }

  const nextManifest = {
    version: 1,
    source: api,
    checkedAt: new Date().toISOString(),
    exclusions: [...noLoadoutIcon].map(([equipmentId, reason]) => ({
      equipmentId,
      purpose: "loadout-icon-watch",
      reason,
    })),
    entries: currentEntries,
  };
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, manifestPath);
  console.log(
    `Accepted Wiki image baseline: ${currentEntries.length} entries (${discovered.filter((entry) => entry.fileTitle).length}/${supportItems.length} support loadout icons discovered; ${noLoadoutIcon.size} expected exclusions).`,
  );
  process.exit(0);
}

if (!manifest) {
  console.error(
    "Image manifest is missing. Run `npm run images:accept` once after review.",
  );
  process.exit(1);
}

if (changes.length) {
  console.error(JSON.stringify(changes, null, 2));
  console.error(
    "Wiki image changes detected. Review them before running `npm run images:accept`.",
  );
  process.exit(1);
}

console.log(
  `Wiki images unchanged: ${currentEntries.length} entries (${discovered.filter((entry) => entry.fileTitle).length}/${supportItems.length} support loadout icons discovered; ${noLoadoutIcon.size} expected exclusions).`,
);
