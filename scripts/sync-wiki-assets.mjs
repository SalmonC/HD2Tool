import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import prettier from "prettier";

const root = resolve(import.meta.dirname, "..");
const normalizedPath = resolve(root, "src/data/source/wiki-normalized.json");
const manifestPath = resolve(root, "src/data/assets/manifest.json");
const publicRoot = resolve(root, "public");
const reportPath = resolve(root, "reports/wiki-assets-report.json");
const offline = process.argv.includes("--offline");
const userAgent =
  "HD2-Supply-Book-assets/0.1 (Wiki file provenance; contact repository maintainers)";

const normalized = JSON.parse(await readFile(normalizedPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const existing = new Map(
  (manifest.assets ?? []).map((asset) => [
    asset.itemId ?? asset.filePage,
    asset,
  ]),
);
const fileKey = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s_]+/g, "");
const fileByTitle = new Map(
  (normalized.files ?? []).map((file) => [fileKey(file.fileTitle), file]),
);

function rightsStatusFromLicense(license) {
  const value = String(license ?? "").trim();
  if (!value || /^License\/$/i.test(value)) return "pending";
  if (/creative\s*commons|^License\/CC-/i.test(value)) return "open-license";
  return "documented-copyrighted";
}

function extensionFor(file) {
  if (file.mime === "image/svg+xml") return ".svg";
  if (file.mime === "image/webp") return ".webp";
  if (file.mime === "image/jpeg") return ".jpg";
  return ".png";
}

function safeItemPath(item, file) {
  return `assets/wiki/${item.id}${extensionFor(file)}`;
}

function fileSourceRef(file) {
  return (
    file.sourceRefs?.[0] ?? {
      kind: "wiki",
      label: `Helldivers Wiki.gg file: ${file.fileTitle}`,
      url: file.filePage,
      pageId: file.pageId,
      revision: file.revision,
      oldid: file.revision,
      capturedAt: file.timestamp,
    }
  );
}

async function readExistingBytes(asset) {
  if (!asset?.path) return null;
  try {
    return await readFile(resolve(publicRoot, asset.path));
  } catch {
    return null;
  }
}

async function download(file) {
  if (offline) return null;
  const url = file.thumbnailUrl ?? file.originalUrl;
  if (!url) return null;
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const assets = [];
const failures = [];
let downloaded = 0;
let reused = 0;
async function materialize(item) {
  const file = fileByTitle.get(fileKey(item.imageFileTitle));
  if (!file) {
    return { failure: { itemId: item.id, reason: "missing file metadata" } };
  }
  const rightsStatus = rightsStatusFromLicense(file.licenseRaw ?? file.license);
  const old = existing.get(item.id) ?? existing.get(file.filePage);
  const oldBytes = await readExistingBytes(old);
  let bytes = oldBytes;
  try {
    if (!bytes) bytes = await download(file);
  } catch (error) {
    return {
      failure: {
        itemId: item.id,
        fileTitle: file.fileTitle,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
  // Unknown rights are never materialized as a real Wiki image. The UI will
  // use the category placeholder until a later snapshot documents the file.
  if (!bytes || rightsStatus === "pending") {
    return {
      failure: {
        itemId: item.id,
        fileTitle: file.fileTitle,
        reason: !bytes
          ? "image bytes unavailable"
          : "license raw value missing",
      },
    };
  }
  const relativePath = safeItemPath(item, file);
  const absolutePath = resolve(publicRoot, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const provenanceStatus =
    file.filePage && file.originalUrl && file.revision && fileHash
      ? "verified"
      : "pending";
  return {
    asset: {
      itemId: item.id,
      fileTitle: file.fileTitle,
      path: relativePath,
      alt: item.canonicalTitle,
      status: provenanceStatus === "verified" ? "verified" : "candidate",
      provenanceStatus,
      rightsStatus,
      originalPage: item.sourceRefs?.[0]?.url ?? null,
      filePage: file.filePage ?? null,
      originalUrl: file.originalUrl ?? null,
      downloadUrl: file.thumbnailUrl ?? file.originalUrl ?? null,
      author: file.author ?? null,
      syncedAt: normalized.syncedAt,
      fileHash,
      sourceHash: file.sha1 ?? null,
      license: file.licenseRaw ?? file.license ?? null,
      licenseRaw: file.licenseRaw ?? file.license ?? null,
      licenseUrl: file.filePage ?? null,
      sourceRefs: [fileSourceRef(file), ...(item.sourceRefs ?? [])],
      licenseStatus: provenanceStatus === "verified" ? "documented" : "pending",
    },
    downloaded: oldBytes ? 0 : 1,
    reused: oldBytes ? 1 : 0,
  };
}

const work = normalized.items ?? [];
let cursor = 0;
async function worker() {
  while (cursor < work.length) {
    const item = work[cursor++];
    const result = await materialize(item);
    if (result.asset) assets.push(result.asset);
    if (result.failure) failures.push(result.failure);
    downloaded += result.downloaded ?? 0;
    reused += result.reused ?? 0;
  }
}
await Promise.all(Array.from({ length: offline ? 1 : 8 }, () => worker()));

const preserved = (manifest.assets ?? [])
  .filter(
    (asset) =>
      !asset.itemId &&
      !asset.fileTitle &&
      (!asset.path.startsWith("assets/wiki/") ||
        asset.path.includes("assets/wiki/currency-")),
  )
  .map((asset) => {
    if (!asset.path.includes("assets/wiki/currency-")) return asset;
    const rightsStatus = rightsStatusFromLicense(
      asset.licenseRaw ?? asset.license,
    );
    const provenanceStatus =
      asset.filePage && asset.originalUrl && asset.fileHash
        ? "verified"
        : "pending";
    return {
      ...asset,
      licenseRaw: asset.licenseRaw ?? asset.license ?? null,
      provenanceStatus,
      rightsStatus,
      licenseStatus:
        provenanceStatus === "verified" && rightsStatus !== "pending"
          ? "documented"
          : "pending",
    };
  });
const result = {
  version: "0.4.0",
  generatedAt: new Date().toISOString(),
  policy: {
    provenance:
      "A verified asset must retain filePage, originalUrl, Wiki revision, local SHA-256 and sourceRefs.",
    rights:
      "rightsStatus separates open-license from documented-copyrighted; author may be null and is never invented.",
    download:
      "Only local 480px Wiki thumbnails are packaged; runtime never fetches the Wiki.",
  },
  assets: [...preserved, ...assets].sort((left, right) =>
    left.path.localeCompare(right.path),
  ),
};
const report = {
  generatedAt: result.generatedAt,
  status: failures.length ? "partial" : "complete",
  normalizedItems: normalized.items?.length ?? 0,
  materialized: assets.length,
  provenanceVerified: assets.filter(
    (asset) => asset.provenanceStatus === "verified",
  ).length,
  openLicense: assets.filter((asset) => asset.rightsStatus === "open-license")
    .length,
  documentedCopyrighted: assets.filter(
    (asset) => asset.rightsStatus === "documented-copyrighted",
  ).length,
  downloaded,
  reused,
  failures,
};
const formatted = await prettier.format(JSON.stringify(result), {
  parser: "json",
});
const staging = `${manifestPath}.staging`;
await writeFile(staging, formatted, "utf8");
await rename(staging, manifestPath);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (failures.length && !offline) process.exitCode = 1;
