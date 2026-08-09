import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const load = async (file) =>
  JSON.parse(await readFile(resolve(root, file), "utf8"));
const catalog = await load("src/data/catalog.json");
const candidates = await load("src/data/candidates/user-supplied.json");
const manifest = await load("src/data/assets/manifest.json");
const errors = [];
const warn = [];
const record = (value) => typeof value === "object" && value !== null;
const sources = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (source) =>
      record(source) &&
      typeof source.kind === "string" &&
      typeof source.label === "string",
  );
const error = (message) => errors.push(message);
if (
  !record(catalog) ||
  !record(catalog.meta) ||
  !record(catalog.taxonomy) ||
  !Array.isArray(catalog.items) ||
  !Array.isArray(catalog.quarantine) ||
  !Array.isArray(catalog.warbonds) ||
  !Array.isArray(catalog.glossaryTerms)
)
  error("catalog structure is incomplete");
if (
  !record(catalog.taxonomy) ||
  typeof catalog.taxonomy.version !== "string" ||
  !record(catalog.taxonomy.dimensions)
)
  error("taxonomy version/dimensions missing");
for (const [id, dimension] of Object.entries(
  catalog.taxonomy?.dimensions ?? {},
)) {
  if (
    !record(dimension) ||
    dimension.id !== id ||
    !sources(dimension.sourceRefs) ||
    typeof dimension.taxonomySource !== "string" ||
    typeof dimension.scaleVersion !== "string"
  )
    error(`invalid taxonomy dimension ${id}`);
  if (
    id === "demolitionPower" &&
    (dimension.numberScale?.min !== 0 ||
      dimension.numberScale?.max !== 60 ||
      dimension.numberScale?.step !== 1)
  )
    error("demolitionPower taxonomy must use the migrated 0..60 integer scale");
}
const assetsByPath = new Map();
for (const [index, asset] of (manifest.assets ?? []).entries()) {
  if (
    !record(asset) ||
    typeof asset.path !== "string" ||
    !sources(asset.sourceRefs) ||
    !["placeholder", "candidate", "verified"].includes(asset.status) ||
    !["project-created-placeholder", "pending", "documented"].includes(
      asset.licenseStatus,
    )
  ) {
    error(`invalid asset manifest record ${index}`);
    continue;
  }
  if (assetsByPath.has(asset.path)) error(`duplicate asset path ${asset.path}`);
  assetsByPath.set(asset.path, asset);
  if (
    asset.licenseStatus === "documented" &&
    (!asset.license ||
      !asset.filePage ||
      !asset.originalUrl ||
      !asset.fileHash ||
      asset.provenanceStatus !== "verified" ||
      !["open-license", "documented-copyrighted"].includes(asset.rightsStatus))
  )
    error(
      `asset marked documented without concrete provenance/rights metadata ${asset.path}`,
    );
  if (
    asset.provenanceStatus !== undefined &&
    !["verified", "pending"].includes(asset.provenanceStatus)
  )
    error(`invalid asset provenance status ${asset.path}`);
  if (
    asset.rightsStatus !== undefined &&
    !["open-license", "documented-copyrighted", "pending"].includes(
      asset.rightsStatus,
    )
  )
    error(`invalid asset rights status ${asset.path}`);
  if (asset.path.startsWith("/") || asset.path.includes("..")) {
    error(`unsafe asset path ${asset.path}`);
    continue;
  }
  try {
    const path = resolve(root, "public", asset.path);
    await access(path);
    if (asset.fileHash) {
      const hash = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
      if (hash !== asset.fileHash.toLowerCase())
        error(`asset hash mismatch ${asset.path}`);
    }
  } catch {
    error(`asset file missing ${asset.path}`);
  }
}
const warbondIds = new Set(catalog.warbonds.map((warbond) => warbond.id));
const allIds = new Set();
const validAcquisition = (item) => {
  const a = item.acquisition;
  if (!record(a)) return false;
  if (a.kind === "warbond")
    return (
      warbondIds.has(a.warbondId) &&
      Number.isInteger(a.page) &&
      Number.isInteger(a.itemMedals) &&
      Number.isInteger(a.pageUnlockMedals)
    );
  if (a.kind === "requisition") return Number.isInteger(a.requisitionPoints);
  if (a.kind === "default") return true;
  if (a.kind === "superstore")
    return Number.isInteger(a.superCredits) && a.status !== "pending";
  if (a.kind === "edition")
    return Boolean(
      a.editionName &&
      a.status !== "pending" &&
      (a.status === "unavailable" ||
        a.price === null ||
        Number.isInteger(a.price)),
    );
  if (a.kind === "event") return Boolean(a.eventName && a.status !== "pending");
  if (a.kind === "poi") return Boolean(a.location && a.status !== "pending");
  if (a.kind === "unavailable") return Boolean(a.reason);
  if (a.kind === "other") return Boolean(a.label && a.status !== "pending");
  return false;
};
for (const [index, item] of [
  ...(catalog.items ?? []),
  ...(catalog.quarantine ?? []),
].entries()) {
  const location =
    index < catalog.items.length
      ? `items[${index}]`
      : `quarantine[${index - catalog.items.length}]`;
  if (!record(item) || typeof item.id !== "string" || allIds.has(item.id)) {
    error(`invalid or duplicate id at ${location}`);
    continue;
  }
  allIds.add(item.id);
  if (
    !sources(item.sourceRefs) ||
    !Array.isArray(item.translationEvidence) ||
    !item.translationEvidence.length
  )
    error(`missing sources/translation evidence at ${location}`);
  if (!record(item.image) || !assetsByPath.has(item.image.path))
    error(`image manifest mismatch at ${location}`);
  if (item.admissionStatus === "admitted" && !validAcquisition(item))
    error(`admitted item has incomplete acquisition at ${location}`);
  if (
    !["weapon", "stratagem"].includes(item.category) &&
    item.weaponProfile !== undefined
  )
    error(`non-weapon has weaponProfile at ${location}`);
  for (const component of item.attackProfile?.components ?? []) {
    const demo = component.fields?.demolitionForce;
    if (
      demo !== undefined &&
      (!Number.isInteger(demo) || demo < 0 || demo > 60)
    )
      error(`demolitionForce out of 0..60 at ${location}`);
  }
  if (item.admissionStatus === "admitted" && item.nameEn === "")
    error(`admitted item missing canonical English name at ${location}`);
}
for (const [index, currency] of (catalog.currencies ?? []).entries()) {
  if (
    !record(currency) ||
    !["medals", "requisition-slips", "super-credits"].includes(currency.type) ||
    typeof currency.labelZh !== "string" ||
    !assetsByPath.has(currency.iconAssetPath) ||
    !sources(currency.sourceRefs)
  )
    error(`invalid currency record ${index}`);
}
if (!Array.isArray(candidates.records) || candidates.records.length !== 10)
  error("user candidate layer must preserve all 10 original records");
for (const [index, candidate] of (candidates.records ?? []).entries())
  if (
    candidate.source !== "user" ||
    candidate.verificationStatus !== "pending" ||
    typeof candidate.rawText !== "string" ||
    typeof candidate.submittedAt !== "string"
  )
    error(`invalid pending candidate ${index}`);
if ((catalog.quarantine ?? []).length)
  warn.push(
    `${catalog.quarantine.length} items remain quarantined and are hidden from the formal search.`,
  );
for (const message of warn) console.warn(`WARN ${message}`);
if (errors.length) {
  for (const message of errors) console.error(`ERROR ${message}`);
  process.exitCode = 1;
} else
  console.log(
    `Validated ${catalog.items.length} admitted items, ${catalog.quarantine.length} quarantined items, ${catalog.glossaryTerms.length} glossary terms and ${candidates.records.length} pending candidates.`,
  );
