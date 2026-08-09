import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  classifyPage,
  normalizeEquipmentPage,
  normalizeWarbondPage,
  parseWarbondContents,
  parseWarbondPageThresholds,
  stableEquipmentId,
} from "../wiki-normalize.mjs";
import {
  classifyProductScope,
  classifyFormalCatalogUnexpectedIds,
} from "../lib/product-scope.mjs";
import correctionsConfig from "../../data/v3/config/warbond-corrections.json" with { type: "json" };
import fixtureConfig from "../../data/v3/config/resolver-fixtures.json" with { type: "json" };

export const PRODUCT_KINDS = Object.freeze([
  "primary-weapon",
  "secondary-weapon",
  "grenade",
  "body-armor",
  "support-weapon",
  "other-stratagem",
]);

export const ROOT = resolve(import.meta.dirname, "../..");
export const INPUT_PATHS = Object.freeze({
  raw: resolve(ROOT, "src/data/source/wiki-raw.json"),
  normalizedDiff: resolve(ROOT, "src/data/source/wiki-normalized.json"),
  catalogDiff: resolve(ROOT, "src/data/catalog.json"),
  localizationDiff: resolve(ROOT, "src/data/source/official-localization.json"),
  localizationAttestation: resolve(
    ROOT,
    "data/v3/config/localization-attestation.json",
  ),
  communityDiff: resolve(
    ROOT,
    "src/data/source/xiaoheihe-community-aliases.json",
  ),
});

export const SOURCE_MANIFEST_INPUT_SPEC = Object.freeze([
  Object.freeze({
    inputId: "wiki-raw",
    path: "src/data/source/wiki-raw.json",
    role: "raw-fact-snapshot",
  }),
  Object.freeze({
    inputId: "wiki-normalized-reference",
    path: "src/data/source/wiki-normalized.json",
    role: "diff-only-reference",
  }),
  Object.freeze({
    inputId: "legacy-catalog-reference",
    path: "src/data/catalog.json",
    role: "formal-offer-diff-reference",
  }),
  Object.freeze({
    inputId: "official-localization-registry",
    path: "src/data/source/official-localization.json",
    role: "correction-evidence-only-sealed-derived-snapshot",
  }),
  Object.freeze({
    inputId: "localization-attestation",
    path: "data/v3/config/localization-attestation.json",
    role: "content-addressed-localization-attestation",
  }),
  Object.freeze({
    inputId: "community-alias-reference",
    path: "src/data/source/xiaoheihe-community-aliases.json",
    role: "diff-only-alias-reference",
  }),
  Object.freeze({
    inputId: "resolver-fixtures",
    path: "data/v3/config/resolver-fixtures.json",
    role: "raw-coordinate-test-fixture",
  }),
  Object.freeze({
    inputId: "warbond-corrections",
    path: "data/v3/config/warbond-corrections.json",
    role: "typed-correction-config",
  }),
]);

export const M1_TOOL_BUNDLE_PATHS = Object.freeze([
  "scripts/v3/migration-common.mjs",
  "scripts/v3/migration-preflight.mjs",
  "scripts/v3/migration-tests.mjs",
  "scripts/v3/raw-probe.mjs",
  "scripts/v3/raw-validator.mjs",
  "scripts/v3/resolver-gate.mjs",
  "scripts/wiki-normalize.mjs",
  "scripts/lib/product-scope.mjs",
]);

export const readJson = (filePath) =>
  readFile(filePath, "utf8").then(JSON.parse);

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

export function attestationContentHash(attestation) {
  if (
    !attestation ||
    typeof attestation !== "object" ||
    Array.isArray(attestation)
  )
    return null;
  const content = { ...attestation };
  delete content.artifactSha256;
  return sha256(content);
}

const LOCALIZATION_ATTESTATION_EXPECTED = Object.freeze({
  appId: "553850",
  buildId: "24036910",
  appManifestSha256:
    "535a0ace24ab0405a3452f4916f69e11053cfcaa2c87b9c721f4e99c8f256a46",
  extractorRepository: "xypwn/filediver",
  extractorRelease: "v0.7.36",
  extractorExecutableSha256:
    "301a4ae0a89772bc9d35fd2b8e9e72e8162a4182be39aede44fedb422d4ca3f0",
  registryId: "equipment-primary",
  englishFile: "0x4f68a1db55e6da09.strings.json",
  englishSha256:
    "bce4468d52268fc8dbe3ba6a298cdab8c3e837fde0ffb6b2e0d5f7a9ea5b8aa5",
  simplifiedFile: "0x95ee90e8062250a6.strings.json",
  simplifiedSha256:
    "ae242b3899b2bb3dc36df89af572ab0be02e141a8be79558cc7bdf4bed2810b7",
});

export const LAS_LOCALIZATION_ENTRY_CONTRACT = Object.freeze([
  Object.freeze({
    key: 2350507039,
    english: "LAS-13 Trident",
    simplifiedChinese: "LAS-13\u201c\u4e09\u53c9\u621f\u201d",
  }),
  Object.freeze({
    key: 2990487434,
    english: "LAS-13 TRIDENT",
    simplifiedChinese: "LAS-13\u201c\u4e09\u53c9\u621f\u201d",
  }),
]);

function localizationEntrySet(entries) {
  return canonicalJson(
    (entries ?? [])
      .map((entry) => ({
        key: entry.key,
        english: entry.english,
        simplifiedChinese: entry.simplifiedChinese,
      }))
      .sort((left, right) => left.key - right.key),
  );
}

function localizationEntryContractErrors(entries, prefix) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length === 0)
    return [`${prefix}-entries-required`];
  const keys = new Set();
  for (const entry of entries) {
    if (
      !entry ||
      !Number.isInteger(entry.key) ||
      typeof entry.english !== "string" ||
      typeof entry.simplifiedChinese !== "string"
    )
      errors.push(`${prefix}-entry-invalid`);
    if (keys.has(entry?.key))
      errors.push(`${prefix}-duplicate-key:${entry?.key}`);
    keys.add(entry?.key);
  }
  if (
    localizationEntrySet(entries) !==
    localizationEntrySet(LAS_LOCALIZATION_ENTRY_CONTRACT)
  )
    errors.push(`${prefix}-entry-set-mismatch`);
  return errors;
}

export function validateLocalizationAttestationShape(attestation) {
  const errors = [];
  if (
    !attestation ||
    typeof attestation !== "object" ||
    Array.isArray(attestation)
  )
    return ["attestation-not-object"];
  if (attestation.schemaVersion !== "m1-localization-attestation.v1")
    errors.push("schema-version-invalid");
  if (
    typeof attestation.attestationId !== "string" ||
    !attestation.attestationId.trim()
  )
    errors.push("attestation-id-missing");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(
      String(attestation.createdAt ?? ""),
    )
  )
    errors.push("createdAt-invalid");
  if (
    typeof attestation.artifactSha256 !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(attestation.artifactSha256)
  )
    errors.push("artifact-hash-invalid");
  if (!attestation.game || typeof attestation.game !== "object")
    errors.push("game-metadata-missing");
  else {
    for (const key of ["appId", "buildId", "appManifestSha256"])
      if (
        typeof attestation.game[key] !== "string" ||
        !attestation.game[key].trim()
      )
        errors.push(`game-${key}-missing`);
  }
  if (!attestation.extractor || typeof attestation.extractor !== "object")
    errors.push("extractor-metadata-missing");
  else {
    for (const key of ["repository", "release", "executableSha256"])
      if (
        typeof attestation.extractor[key] !== "string" ||
        !attestation.extractor[key].trim()
      )
        errors.push(`extractor-${key}-missing`);
  }
  if (
    !attestation.command?.parameters ||
    typeof attestation.command.parameters !== "object"
  )
    errors.push("command-parameters-missing");
  if (!attestation.sourceFiles || typeof attestation.sourceFiles !== "object")
    errors.push("source-files-missing");
  else
    for (const key of ["english", "simplifiedChinese"]) {
      const file = attestation.sourceFiles[key];
      if (
        !file ||
        typeof file !== "object" ||
        typeof file.fileName !== "string" ||
        typeof file.sha256 !== "string"
      )
        errors.push(`source-file-${key}-invalid`);
    }
  if (
    !attestation.registry ||
    typeof attestation.registry !== "object" ||
    typeof attestation.registry.registryId !== "string" ||
    typeof attestation.registry.registrySha256 !== "string"
  )
    errors.push("registry-binding-missing");
  const entries = Array.isArray(attestation.entries) ? attestation.entries : [];
  if (entries.length !== 2) errors.push(`entry-count:${entries.length}`);
  const keys = new Set();
  for (const entry of entries) {
    if (
      !entry ||
      !Number.isInteger(entry.key) ||
      typeof entry.english !== "string" ||
      typeof entry.simplifiedChinese !== "string"
    )
      errors.push("entry-invalid");
    if (keys.has(entry?.key)) errors.push(`duplicate-entry-key:${entry?.key}`);
    keys.add(entry?.key);
  }
  return errors;
}

export function validateLocalizationAttestation(
  attestation,
  localization,
  corrections = correctionsConfig,
  localizationByteSha256 = null,
) {
  const errors = validateLocalizationAttestationShape(attestation);
  if (errors.length) return errors;
  if (attestation.artifactSha256 !== attestationContentHash(attestation))
    errors.push("artifact-content-hash-mismatch");
  errors.push(
    ...localizationEntryContractErrors(attestation.entries, "las-attestation"),
  );
  if (attestation.game.appId !== LOCALIZATION_ATTESTATION_EXPECTED.appId)
    errors.push("app-id-mismatch");
  if (attestation.game.buildId !== LOCALIZATION_ATTESTATION_EXPECTED.buildId)
    errors.push("game-build-mismatch");
  if (
    attestation.game.appManifestSha256 !==
    LOCALIZATION_ATTESTATION_EXPECTED.appManifestSha256
  )
    errors.push("appmanifest-hash-mismatch");
  if (
    attestation.extractor.repository !==
      LOCALIZATION_ATTESTATION_EXPECTED.extractorRepository ||
    attestation.extractor.release !==
      LOCALIZATION_ATTESTATION_EXPECTED.extractorRelease
  )
    errors.push("extractor-version-mismatch");
  if (
    attestation.extractor.executableSha256 !==
    LOCALIZATION_ATTESTATION_EXPECTED.extractorExecutableSha256
  )
    errors.push("extractor-hash-mismatch");
  const sourceFiles = localization?.sourceFiles ?? [];
  const pair = localization?.alignment?.pairedResources?.find(
    (entry) => entry.registryId === attestation.registry.registryId,
  );
  const english = attestation.sourceFiles.english;
  const simplified = attestation.sourceFiles.simplifiedChinese;
  const registryEnglish = sourceFiles.find(
    (entry) => entry.fileName === english.fileName,
  );
  const registrySimplified = sourceFiles.find(
    (entry) => entry.fileName === simplified.fileName,
  );
  if (
    attestation.registry.registryId !==
    LOCALIZATION_ATTESTATION_EXPECTED.registryId
  )
    errors.push("registry-id-mismatch");
  if (
    localizationByteSha256 &&
    attestation.registry.registrySha256 !== localizationByteSha256
  )
    errors.push("registry-byte-hash-mismatch");
  if (
    !pair ||
    pair.englishFile !== english.fileName ||
    pair.englishSha256 !== english.sha256 ||
    pair.simplifiedFile !== simplified.fileName ||
    pair.simplifiedSha256 !== simplified.sha256
  )
    errors.push("registry-pair-mismatch");
  if (
    !registryEnglish ||
    registryEnglish.sha256 !== english.sha256 ||
    english.fileName !== LOCALIZATION_ATTESTATION_EXPECTED.englishFile ||
    english.sha256 !== LOCALIZATION_ATTESTATION_EXPECTED.englishSha256
  )
    errors.push("english-source-mismatch");
  if (
    !registrySimplified ||
    registrySimplified.sha256 !== simplified.sha256 ||
    simplified.fileName !== LOCALIZATION_ATTESTATION_EXPECTED.simplifiedFile ||
    simplified.sha256 !== LOCALIZATION_ATTESTATION_EXPECTED.simplifiedSha256
  )
    errors.push("simplified-source-mismatch");
  const records = localization?.records ?? [];
  for (const entry of attestation.entries) {
    const record = records.find(
      (candidate) =>
        candidate.key === entry.key &&
        candidate.resourcePair ===
          `${english.fileName}::${simplified.fileName}`,
    );
    if (
      !record ||
      record.english !== entry.english ||
      record.simplifiedChinese !== entry.simplifiedChinese
    )
      errors.push(`entry-registry-mismatch:${entry.key}`);
  }
  const lasCorrections = (corrections?.corrections ?? []).filter(
    (correction) => correction.targetId === "las-13-trident",
  );
  if (!lasCorrections.length) errors.push("las-correction-missing");
  for (const correction of lasCorrections)
    for (const binding of correction.officialLocalizationBindings ?? []) {
      if (
        binding.registryId !== attestation.registry.registryId ||
        binding.registrySha256 !== attestation.registry.registrySha256 ||
        binding.gameBuild !== attestation.game.buildId ||
        binding.englishFile !== english.fileName ||
        binding.englishSha256 !== english.sha256 ||
        binding.simplifiedFile !== simplified.fileName ||
        binding.simplifiedSha256 !== simplified.sha256
      )
        errors.push(`las-binding-mismatch:${correction.correctionId}`);
      for (const entry of binding.entries ?? [])
        if (
          !attestation.entries.some(
            (candidate) =>
              candidate.key === entry.key &&
              candidate.english === entry.english &&
              candidate.simplifiedChinese === entry.simplifiedChinese,
          )
        )
          errors.push(`las-entry-not-attested:${entry.key}`);
    }
  return [...new Set(errors)];
}

export function validateSourceManifestShape(manifest) {
  const errors = [];
  const inputs = Array.isArray(manifest?.inputs) ? manifest.inputs : [];
  if (inputs.length !== SOURCE_MANIFEST_INPUT_SPEC.length)
    errors.push(`input-count:${inputs.length}`);
  const expectedById = new Map(
    SOURCE_MANIFEST_INPUT_SPEC.map((entry) => [entry.inputId, entry]),
  );
  const seenIds = new Set();
  const seenPaths = new Set();
  for (const entry of inputs) {
    if (!entry || typeof entry !== "object") {
      errors.push("input-not-object");
      continue;
    }
    if (seenIds.has(entry.inputId))
      errors.push(`duplicate-input-id:${entry.inputId}`);
    if (seenPaths.has(entry.path))
      errors.push(`duplicate-input-path:${entry.path}`);
    seenIds.add(entry.inputId);
    seenPaths.add(entry.path);
    const expected = expectedById.get(entry.inputId);
    if (!expected) errors.push(`unexpected-input-id:${entry.inputId}`);
    else {
      if (entry.path !== expected.path)
        errors.push(`input-path-mismatch:${entry.inputId}`);
      if (entry.role !== expected.role)
        errors.push(`input-role-mismatch:${entry.inputId}`);
      if (entry.required !== true)
        errors.push(`input-not-required:${entry.inputId}`);
    }
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/iu.test(entry.sha256)
    )
      errors.push(`input-hash-invalid:${entry.inputId ?? "unknown"}`);
  }
  for (const expected of SOURCE_MANIFEST_INPUT_SPEC)
    if (!seenIds.has(expected.inputId))
      errors.push(`missing-input-id:${expected.inputId}`);
  const toolBundlePaths =
    manifest?.toolBundle?.files?.map((entry) => entry.path) ?? [];
  const expectedToolPaths = [...M1_TOOL_BUNDLE_PATHS].sort();
  if (
    canonicalJson([...toolBundlePaths].sort()) !==
    canonicalJson(expectedToolPaths)
  )
    errors.push("tool-bundle-closure-mismatch");
  if (
    typeof manifest?.toolBundle?.bundleSha256 !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(manifest.toolBundle.bundleSha256)
  )
    errors.push("tool-bundle-hash-missing");
  return errors;
}

export function toolBundleHash(entries) {
  return sha256(
    entries
      .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

function rawTextSha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

export function normalizeTitle(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/#.*$/u, "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function pageSourceId(page) {
  return `wiki-page:${page.pageid}`;
}

export function pageHash(page) {
  return sha256({
    pageid: page.pageid,
    revid: page.revid,
    title: page.title,
    url: page.url,
    categories: [...(page.categories ?? [])].sort(),
    wikitext: page.wikitext,
  });
}

function pageRef(page, role = "page") {
  return {
    sourceId: pageSourceId(page),
    pageId: page.pageid,
    revision: page.revid,
    sha256: pageHash(page),
    wikitextSha256: rawTextSha256(page.wikitext ?? ""),
    role,
    url: page.url,
  };
}

function sourcePages(raw) {
  return new Map(raw.pages.map((page) => [page.pageid, page]));
}

function buildRawWarbondContext(raw, capturedAt) {
  const warbondPages = raw.pages
    .map((page) => normalizeWarbondPage(page, capturedAt))
    .filter(Boolean);
  const warbondThresholds = Object.fromEntries(
    warbondPages.map((warbond) => [warbond.id, warbond.pageUnlockMedals]),
  );
  const warbondThresholdSources = Object.fromEntries(
    warbondPages.map((warbond) => [
      warbond.id,
      Object.fromEntries(
        Object.keys(warbond.pageUnlockMedals ?? {}).map((page) => [
          page,
          warbond.pageUnlockMedalsSourceRefs ?? [],
        ]),
      ),
    ]),
  );
  const warbondContents = raw.pages
    .map((page) => parseWarbondContents(page, capturedAt))
    .filter((contents) => contents?.pages?.length);
  return {
    capturedAt,
    warbondThresholds,
    warbondThresholdSources,
    warbondContentsById: new Map(
      warbondContents.map((contents) => [contents.warbondId, contents]),
    ),
    attackTaxonomy: {
      options: [],
      taxonomySource: "raw-resolver-context",
      scaleVersion: "raw-resolver-context-v1",
    },
    imagesByTitle: {},
    warbondPages,
  };
}

export function buildRawResolverContext(raw) {
  return buildRawWarbondContext(
    raw,
    raw.syncedAt ?? "2026-08-08T00:00:00.000Z",
  );
}

export function resolveRawEquipmentPage(page, context) {
  try {
    const resolved = normalizeEquipmentPage(page, context);
    return resolved
      ? { status: "resolved", page, item: resolved }
      : { status: "not-equipment", page };
  } catch (error) {
    return {
      status: "parse-error",
      page,
      error: String(error?.stack ?? error),
    };
  }
}

export function productKindForResolved(page, item) {
  if (item.category === "weapon" && item.slot === "primary")
    return "primary-weapon";
  if (item.category === "weapon" && item.slot === "secondary")
    return "secondary-weapon";
  if (item.category === "weapon" && item.slot === "support")
    return "support-weapon";
  if (item.category === "grenade") return "grenade";
  if (item.category === "armor" && item.slot === "armor") return "body-armor";
  if (
    item.category === "stratagem" &&
    /support weapon/i.test(item.rawFields?.stratagem_type ?? page.wikitext)
  )
    return "support-weapon";
  if (item.category === "stratagem") return "other-stratagem";
  return null;
}

export function scopeInputForResolved(page, item) {
  const productKind = productKindForResolved(page, item);
  if (productKind === "primary-weapon")
    return { id: item.id, category: "weapon", slot: "primary" };
  if (productKind === "secondary-weapon")
    return { id: item.id, category: "weapon", slot: "secondary" };
  if (productKind === "support-weapon")
    return { id: item.id, category: "weapon", slot: "support" };
  if (productKind === "grenade")
    return { id: item.id, category: "grenade", slot: "throwable" };
  if (productKind === "body-armor")
    return { id: item.id, category: "armor", slot: "armor" };
  if (productKind === "other-stratagem")
    return { id: item.id, category: "stratagem", slot: "stratagem" };
  return { id: item.id, category: item.category, slot: item.slot };
}

export function resolveProductScope(page, item) {
  const input = scopeInputForResolved(page, item);
  return {
    input,
    productKind: productKindForResolved(page, item),
    ...classifyProductScope(input),
  };
}

export function resolveRawSnapshot(raw) {
  const context = buildRawResolverContext(raw);
  const pageRecords = [];
  const equipmentRecords = [];
  const warbondRecords = [];
  const byId = new Map();
  for (const page of raw.pages) {
    const equipment = resolveRawEquipmentPage(page, context);
    if (equipment.status === "parse-error") {
      pageRecords.push({
        pageId: page.pageid,
        title: page.title,
        revision: page.revid,
        disposition: "parse-error",
        reason: "resolver-threw",
        error: equipment.error,
      });
      continue;
    }
    if (equipment.status === "resolved") {
      const scope = resolveProductScope(page, equipment.item);
      if (byId.has(equipment.item.id)) {
        pageRecords.push({
          pageId: page.pageid,
          title: page.title,
          revision: page.revid,
          disposition: "duplicate",
          reason: "stable-id-duplicate",
          stableId: equipment.item.id,
        });
      } else {
        byId.set(equipment.item.id, { page, item: equipment.item, scope });
        equipmentRecords.push({ page, item: equipment.item, scope });
        pageRecords.push({
          pageId: page.pageid,
          title: page.title,
          revision: page.revid,
          disposition: "normalized",
          recordType: "equipment",
          stableId: equipment.item.id,
          scopeClass: scope.scopeClass,
          productKind: scope.productKind,
        });
      }
      continue;
    }
    try {
      const warbond = normalizeWarbondPage(page, context.capturedAt);
      if (warbond) {
        warbondRecords.push({ page, warbond });
        pageRecords.push({
          pageId: page.pageid,
          title: page.title,
          revision: page.revid,
          disposition: "normalized",
          recordType: "warbond",
          stableId: warbond.id,
        });
        continue;
      }
      const classification = classifyPage(page);
      pageRecords.push({
        pageId: page.pageid,
        title: page.title,
        revision: page.revid,
        disposition: "excluded",
        reason: classification ? "not-product-record" : "not-supported-page",
      });
    } catch (error) {
      pageRecords.push({
        pageId: page.pageid,
        title: page.title,
        revision: page.revid,
        disposition: "parse-error",
        reason: "classification-threw",
        error: String(error?.stack ?? error),
      });
    }
  }
  const pagesById = sourcePages(raw);
  return {
    context,
    pageRecords: pageRecords.map((record) => ({
      ...record,
      sourceId: `wiki-page:${record.pageId}`,
      sourceHash: pageHash(pagesById.get(record.pageId)),
    })),
    equipmentRecords,
    warbondRecords,
    byId,
    sourcePages: pagesById,
  };
}

function extractTemplate(text, name) {
  const start = text.search(
    new RegExp(`\\{\\{\\s*${name}(?:\\s|\\n|\\|)`, "i"),
  );
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
    } else if (pair === "}}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 2);
      index += 1;
    }
  }
  return null;
}

function splitTopLevel(template) {
  const body = template.replace(/^\{\{[^|]+\|?/, "").replace(/\}\}$/, "");
  const parts = [];
  let current = "";
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      index += 1;
    } else if (pair === "}}") {
      templateDepth -= 1;
      current += pair;
      index += 1;
    } else if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
    } else if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
    } else if (body[index] === "|" && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
    } else current += body[index];
  }
  parts.push(current);
  return parts;
}

function templateFields(template) {
  return Object.fromEntries(
    splitTopLevel(template)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator < 0
          ? null
          : [
              part.slice(0, separator).trim().toLowerCase(),
              part.slice(separator + 1).trim(),
            ];
      })
      .filter(Boolean),
  );
}

function cleanLinkedTitle(value) {
  return String(value ?? "")
    .replace(/^:+/, "")
    .replace(/_/g, " ")
    .split("#", 1)[0]
    .trim();
}

function rewardKindFromEvidence(value) {
  const text = String(value ?? "")
    .replace(/[_-]+/gu, " ")
    .toLocaleLowerCase("en-US");
  if (/player\s*card/iu.test(text)) return "player-card";
  if (/\bcape\b/iu.test(text)) return "cape";
  if (/\bhelmet\b/iu.test(text)) return "helmet";
  if (/\b(?:light|medium|heavy)\s+armor\b|\barmor\b/iu.test(text))
    return "body-armor";
  if (/\bpattern\b/iu.test(text)) return "pattern";
  if (/super\s*credits?|\bcurrency\b/iu.test(text)) return "currency";
  if (/\btitle\b/iu.test(text)) return "title";
  if (/\bemote\b/iu.test(text)) return "emote";
  if (/victory\s*pose/iu.test(text)) return "victory-pose";
  if (/\bbooster\b/iu.test(text)) return "booster";
  return null;
}

function warbondIdFromTitle(title) {
  return stableEquipmentId(
    String(title)
      .replace(/\s+Premium\s+Warbond$/iu, "")
      .replace(/\s+Warbond$/iu, ""),
  );
}

function numberFrom(value) {
  const match = String(value ?? "")
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function tableCandidates(section) {
  const output = [];
  for (const row of section.split(/\n\|-\s*/u).slice(1)) {
    const cells = row
      .split(/\|\|/u)
      .map((cell) => cell.replace(/^\s*\|\s*/u, "").trim());
    const itemCell = cells[1] ?? "";
    const typeCell = cells[2] ?? "";
    const itemMatch = itemCell.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/u);
    const item = itemMatch
      ? {
          target: cleanLinkedTitle(itemMatch[1]),
          label: itemMatch[2] ?? itemMatch[1],
        }
      : null;
    const typeMatch = typeCell.match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/u);
    const type = typeMatch
      ? {
          target: cleanLinkedTitle(typeMatch[1]),
          label: typeMatch[2] ?? typeMatch[1].split("#").at(-1),
        }
      : { target: "", label: typeCell.replace(/'{2,}/gu, "").trim() };
    const image = cells[0]?.match(/\[\[File:([^|\]]+)/iu)?.[1]?.trim() ?? null;
    const cost = numberFrom(
      row.match(/\{\{\s*Currency\s*\|\s*Medals\s*\|\s*([\d,]+)/iu)?.[1],
    );
    const plainItem = itemCell
      ?.replace(/\[\[[^\]]+\]\]/gu, "")
      .replace(/<[^>]+>/gu, "")
      .replace(/'{2,}/gu, "")
      .trim();
    const canonicalTitle = item?.target ?? plainItem ?? null;
    const hasContentsRow = Boolean(
      canonicalTitle || /\{\{\s*Currency\s*\|/iu.test(row),
    );
    if (hasContentsRow)
      output.push({
        canonicalTitle,
        linkedCanonical: Boolean(item?.target),
        type: type?.label ?? "",
        image,
        rewardKind:
          rewardKindFromEvidence(type?.label) ?? rewardKindFromEvidence(image),
        itemMedals: cost,
        sourceKind: "contents-table",
      });
  }
  return output;
}

export function extractWarbondCandidates(page) {
  const candidates = [];
  const headings = [
    ...String(page.wikitext ?? "").matchAll(/===+\s*Page\s*(\d+)\s*===+/giu),
  ];
  for (
    let headingIndex = 0;
    headingIndex < headings.length;
    headingIndex += 1
  ) {
    const pageNumber = Number(headings[headingIndex][1]);
    const start =
      headings[headingIndex].index + headings[headingIndex][0].length;
    const nextSection = page.wikitext.slice(start).search(/\n==[^=]/u);
    const sectionEnd =
      nextSection < 0 ? page.wikitext.length : start + nextSection;
    const end = Math.min(
      headings[headingIndex + 1]?.index ?? sectionEnd,
      sectionEnd,
    );
    const section = page.wikitext.slice(start, end);
    const acquisitions = extractTemplate(section, "Acquisitions\\s+Page");
    if (acquisitions) {
      const fields = templateFields(acquisitions);
      for (const [key, rawValue] of Object.entries(fields))
        if (/^\d+_link$/u.test(key) && rawValue.trim()) {
          const number = key.split("_", 1)[0];
          const image = fields[`${number}_image`] ?? "";
          candidates.push({
            candidateId: `raw:${page.pageid}:p${pageNumber}:template:${number}`,
            warbondId: warbondIdFromTitle(page.title),
            page: pageNumber,
            canonicalTitle: cleanLinkedTitle(rawValue),
            itemMedals: numberFrom(fields[`${number}_cost`]),
            type: "",
            image,
            rewardKind:
              rewardKindFromEvidence(image) ?? rewardKindFromEvidence(rawValue),
            sourceKind: "acquisitions-template",
            sourcePageId: page.pageid,
            sourceRevision: page.revid,
          });
        }
    }
    tableCandidates(section).forEach((candidate, index) =>
      candidates.push({
        ...candidate,
        candidateId: `raw:${page.pageid}:p${pageNumber}:table:${index + 1}`,
        warbondId: warbondIdFromTitle(page.title),
        page: pageNumber,
        sourcePageId: page.pageid,
        sourceRevision: page.revid,
      }),
    );
  }
  return candidates;
}

function correctionKey(warbondId, page, title) {
  return `${warbondId}:${page}:${normalizeTitle(title)}`;
}

function validateOfficialLocalizationBindings(
  correction,
  localization,
  localizationByteSha256 = null,
) {
  const bindings = correction.officialLocalizationBindings ?? [];
  if (!bindings.length) return { status: "current", sourceBindings: [] };
  if (!localization)
    return {
      status: "stale",
      sourceBindings: [],
      reason: "official-localization-registry-not-loaded",
    };
  const sourceBindings = [];
  for (const binding of bindings) {
    const registry = localization.sourceRegistry?.find(
      (entry) => entry.id === binding.registryId,
    );
    const pair = localization.alignment?.pairedResources?.find(
      (entry) => entry.registryId === binding.registryId,
    );
    const englishFile = localization.sourceFiles?.find(
      (entry) => entry.fileName === binding.englishFile,
    );
    const simplifiedFile = localization.sourceFiles?.find(
      (entry) => entry.fileName === binding.simplifiedFile,
    );
    const errors = [];
    if (
      binding.registrySha256 &&
      localizationByteSha256 !== binding.registrySha256
    )
      errors.push("registry-byte-hash-mismatch");
    if (!registry || !pair) errors.push("registry-pair-missing");
    if (localization.gameBuild !== binding.gameBuild)
      errors.push("game-build-mismatch");
    if (
      !englishFile ||
      englishFile.sha256 !== binding.englishSha256 ||
      pair?.englishFile !== binding.englishFile ||
      pair?.englishSha256 !== binding.englishSha256
    )
      errors.push("english-file-hash-mismatch");
    if (
      !simplifiedFile ||
      simplifiedFile.sha256 !== binding.simplifiedSha256 ||
      pair?.simplifiedFile !== binding.simplifiedFile ||
      pair?.simplifiedSha256 !== binding.simplifiedSha256
    )
      errors.push("simplified-file-hash-mismatch");
    const records = localization.records ?? [];
    for (const entry of binding.entries ?? []) {
      const record = records.find(
        (candidate) =>
          candidate.key === entry.key &&
          candidate.resourcePair ===
            `${binding.englishFile}::${binding.simplifiedFile}`,
      );
      if (
        !record ||
        record.english !== entry.english ||
        record.simplifiedChinese !== entry.simplifiedChinese ||
        !record.englishValues?.includes(entry.english) ||
        !record.simplifiedChineseValues?.includes(entry.simplifiedChinese)
      )
        errors.push(`entry-mismatch:${entry.key}`);
      else
        sourceBindings.push({
          sourceId: `official-localization:${binding.registryId}:${entry.key}`,
          kind: "official-localization",
          registryId: binding.registryId,
          gameBuild: binding.gameBuild,
          key: entry.key,
          englishFile: binding.englishFile,
          englishSha256: binding.englishSha256,
          simplifiedFile: binding.simplifiedFile,
          simplifiedSha256: binding.simplifiedSha256,
          english: record.english,
          simplifiedChinese: record.simplifiedChinese,
          sha256: sha256({
            registryId: binding.registryId,
            key: entry.key,
            english: record.english,
            simplifiedChinese: record.simplifiedChinese,
            englishSha256: binding.englishSha256,
            simplifiedSha256: binding.simplifiedSha256,
          }),
        });
    }
    if (errors.length)
      return {
        status: "stale",
        sourceBindings,
        reason: "official-localization-binding-stale",
        errors,
      };
  }
  return { status: "current", sourceBindings };
}

function correctionContractErrors(correction, pagesById, target, resolution) {
  const errors = [];
  const requiredStrings = [
    "correctionId",
    "warbondId",
    "contentsTitle",
    "targetId",
    "targetCanonicalTitle",
    "fieldPath",
    "reason",
    "reviewer",
    "reviewedAt",
  ];
  for (const key of requiredStrings)
    if (typeof correction[key] !== "string" || !correction[key].trim())
      errors.push(`missing-${key}`);
  for (const key of ["page"])
    if (!Number.isInteger(correction[key]) || correction[key] < 1)
      errors.push(`invalid-${key}`);
  if (
    !correction.expectedBefore ||
    typeof correction.expectedBefore !== "object"
  )
    errors.push("missing-expectedBefore");
  else {
    for (const [key, expected] of [
      ["warbondId", correction.warbondId],
      ["page", correction.page],
      ["contentsTitle", correction.contentsTitle],
    ]) {
      if (correction.expectedBefore[key] !== expected)
        errors.push(`expectedBefore-mismatch:${key}`);
    }
  }
  if (!correction.after || typeof correction.after !== "object")
    errors.push("missing-after");
  else {
    if (correction.after.canonicalId !== correction.targetId)
      errors.push("after-target-id-mismatch");
    if (correction.after.canonicalTitle !== correction.targetCanonicalTitle)
      errors.push("after-target-title-mismatch");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(
      correction.reviewedAt,
    )
  )
    errors.push("invalid-reviewedAt");
  const bindings = Array.isArray(correction.sourceBindings)
    ? correction.sourceBindings
    : [];
  if (bindings.length < 2) errors.push("source-bindings-minimum-two");
  const roles = bindings.map((binding) => binding?.role);
  for (const role of ["equipment-page", "contents-page"])
    if (roles.filter((value) => value === role).length !== 1)
      errors.push(`source-binding-role:${role}`);
  const pageIds = new Set();
  for (const binding of bindings) {
    if (
      !binding ||
      !Number.isInteger(binding.pageId) ||
      !Number.isInteger(binding.revision) ||
      !/^\b[a-f0-9]{64}\b$/iu.test(String(binding.wikitextSha256 ?? ""))
    )
      errors.push("source-binding-metadata-invalid");
    if (pageIds.has(binding?.pageId))
      errors.push(`duplicate-source-page:${binding?.pageId}`);
    pageIds.add(binding?.pageId);
  }
  const targetRecord = target;
  if (
    !targetRecord ||
    targetRecord.id !== correction.targetId ||
    targetRecord.canonicalTitle !== correction.targetCanonicalTitle
  )
    errors.push("target-not-current-raw-equipment");
  const exactRawMatches = [...(resolution?.byId?.values() ?? [])].filter(
    (entry) =>
      normalizeTitle(entry.item.canonicalTitle) ===
      normalizeTitle(correction.contentsTitle),
  );
  if (
    exactRawMatches.length > 0 &&
    !exactRawMatches.some((entry) => entry.item.id === correction.targetId)
  ) {
    errors.push("correction-target-does-not-match-exact-raw-title");
  }
  const equipmentBinding = bindings.find(
    (binding) => binding.role === "equipment-page",
  );
  const contentsBinding = bindings.find(
    (binding) => binding.role === "contents-page",
  );
  const equipmentPage = equipmentBinding
    ? pagesById.get(equipmentBinding.pageId)
    : null;
  const contentsPage = contentsBinding
    ? pagesById.get(contentsBinding.pageId)
    : null;
  if (
    equipmentPage &&
    normalizeTitle(equipmentPage.title) !==
      normalizeTitle(correction.targetCanonicalTitle)
  )
    errors.push("equipment-source-title-mismatch");
  if (
    contentsPage &&
    !normalizeTitle(contentsPage.wikitext ?? "").includes(
      normalizeTitle(correction.contentsTitle),
    )
  )
    errors.push("contents-source-title-mismatch");
  const requiresOfficial =
    correction.targetId === "las-13-trident" ||
    correction.correctionId === "siege-breakers-las-16-to-las-13";
  if (
    requiresOfficial &&
    (!Array.isArray(correction.officialLocalizationBindings) ||
      correction.officialLocalizationBindings.length < 1)
  )
    errors.push("official-localization-binding-required");
  if (requiresOfficial && correction.correctionType !== "identity-conflict")
    errors.push("identity-conflict-type-required");
  if (correction.correctionType === "identity-conflict") {
    if (correction.targetId !== "las-13-trident")
      errors.push("identity-conflict-target-invalid");
    const officialBindings = Array.isArray(
      correction.officialLocalizationBindings,
    )
      ? correction.officialLocalizationBindings
      : [];
    const officialEntries = officialBindings.flatMap(
      (binding) => binding.entries ?? [],
    );
    errors.push(
      ...localizationEntryContractErrors(
        officialEntries,
        "identity-conflict-official",
      ),
    );
  }
  return errors;
}

function validateCorrection(
  correction,
  pagesById,
  target,
  localization,
  localizationByteSha256 = null,
  resolution,
) {
  const contractErrors = correctionContractErrors(
    correction,
    pagesById,
    target,
    resolution,
  );
  if (contractErrors.length)
    return {
      status: "invalid-contract",
      errors: contractErrors,
      sourceBindings: [],
    };
  const sourceBindings = [];
  const stale = [];
  for (const binding of correction.sourceBindings) {
    const page = pagesById.get(binding.pageId);
    const actualWikitextSha256 = page
      ? rawTextSha256(page.wikitext ?? "")
      : null;
    if (
      !page ||
      page.revid !== binding.revision ||
      actualWikitextSha256 !== binding.wikitextSha256
    ) {
      stale.push({
        correctionId: correction.correctionId,
        pageId: binding.pageId,
        expectedRevision: binding.revision,
        actualRevision: page?.revid ?? null,
        expectedWikitextSha256: binding.wikitextSha256,
        actualWikitextSha256,
      });
      continue;
    }
    sourceBindings.push({ ...pageRef(page, binding.role), role: binding.role });
  }
  const officialValidation = validateOfficialLocalizationBindings(
    correction,
    localization,
    localizationByteSha256,
  );
  if (
    stale.length ||
    sourceBindings.length !== correction.sourceBindings.length ||
    officialValidation.status !== "current"
  )
    return {
      status: "stale",
      stale,
      sourceBindings,
      officialSourceBindings: officialValidation.sourceBindings,
      officialReason: officialValidation.reason,
      officialErrors: officialValidation.errors ?? [],
    };
  return {
    status: "current",
    sourceBindings,
    officialSourceBindings: officialValidation.sourceBindings,
  };
}

export function buildCorrectionIndex(
  resolution,
  config = correctionsConfig,
  localization = null,
  localizationByteSha256 = null,
) {
  const pagesById = resolution.sourcePages;
  const targetsById = resolution.byId;
  const correctionsApplied = [];
  const staleCorrections = [];
  const invalidCorrections = [];
  const index = new Map();
  const keyCounts = new Map();
  for (const correction of config.corrections ?? []) {
    const key = correctionKey(
      correction.warbondId,
      correction.page,
      correction.contentsTitle,
    );
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  for (const correction of config.corrections) {
    const key = correctionKey(
      correction.warbondId,
      correction.page,
      correction.contentsTitle,
    );
    if ((keyCounts.get(key) ?? 0) !== 1) {
      invalidCorrections.push({
        correctionId: correction.correctionId ?? null,
        reason: "duplicate-correction-key",
        correctionKey: key,
      });
      continue;
    }
    const target = targetsById.get(correction.targetId)?.item;
    const validation = validateCorrection(
      correction,
      pagesById,
      target,
      localization,
      localizationByteSha256,
      resolution,
    );
    if (validation.status !== "current") {
      if (validation.status === "stale")
        staleCorrections.push({
          correctionId: correction.correctionId,
          reason: validation.officialReason ?? "wiki-source-binding-stale",
          pageStale: validation.stale,
          officialErrors: validation.officialErrors ?? [],
        });
      else
        invalidCorrections.push({
          correctionId: correction.correctionId ?? null,
          reason: validation.status,
          errors: validation.errors ?? [],
        });
      continue;
    }
    index.set(key, {
      ...correction,
      sourceBindings: validation.sourceBindings,
      officialSourceBindings: validation.officialSourceBindings,
    });
    correctionsApplied.push({
      correctionId: correction.correctionId,
      kind: correction.correctionType ?? "identity-link",
      fromContentsTitle: correction.contentsTitle,
      toId: correction.targetId,
      sourceBindings: validation.sourceBindings,
      officialSourceBindings: validation.officialSourceBindings,
      conflict: correction.conflict ?? null,
    });
  }
  return { index, correctionsApplied, staleCorrections, invalidCorrections };
}

function typeIsExcluded(type) {
  return /helmet|cape|player\s*card|pattern|emote|title|currency|booster|victory\s*pose/iu.test(
    String(type ?? ""),
  );
}

function typeCompatible(type, item) {
  const value = String(type ?? "").toLowerCase();
  if (!value) return true;
  if (item.scope.productKind === "body-armor")
    return /armor/.test(value) && !/helmet/.test(value);
  if (item.scope.productKind === "grenade")
    return /throwable|grenade/.test(value);
  if (item.scope.productKind === "primary-weapon")
    return (
      /primary|weapon|rifle|shotgun|pistol/.test(value) &&
      !/secondary|support/.test(value)
    );
  if (item.scope.productKind === "secondary-weapon")
    return /secondary|pistol|special/.test(value);
  if (item.scope.productKind === "support-weapon")
    return /support|backpack\s+weapon/.test(value);
  if (item.scope.productKind === "other-stratagem")
    return /stratagem|vehicle|backpack|sentry|mortar|emplacement|orbital|eagle|minefield|guard dog/.test(
      value,
    );
  return false;
}

function resolveExactCandidate(candidate, target) {
  if (target.scope.scopeClass === "upcoming")
    return {
      status: "upcoming",
      reason: "canonical-item-upcoming",
      canonicalId: target.item.id,
      resolutionMode: "exact-canonical-title",
    };
  if (target.scope.scopeClass !== "required")
    return {
      status: "excluded",
      reason: "canonical-item-out-of-product-scope",
      canonicalId: target.item.id,
      resolutionMode: "exact-canonical-title",
    };
  if (
    candidate.sourceKind === "acquisitions-template" &&
    target.scope.productKind === "body-armor" &&
    !candidate.type
  )
    return {
      status: "ambiguous",
      reason: "body-armor-template-lacks-helmet-or-body-type",
      canonicalId: null,
      resolutionMode: "unresolved",
    };
  const typeMatches = typeCompatible(candidate.type, target);
  return {
    status: "resolved",
    reason: typeMatches
      ? "exact-canonical-title-and-type"
      : "exact-canonical-title-type-warning",
    canonicalId: target.item.id,
    resolutionMode: "exact-canonical-title",
    typeWarning: typeMatches ? null : "contents-type-open-vocabulary-mismatch",
  };
}

export function resolveWarbondCandidates(raw, resolution, correctionIndex) {
  const items = [...resolution.byId.values()].map(({ page, item, scope }) => ({
    page,
    item,
    scope,
  }));
  const byTitle = new Map();
  for (const entry of items) {
    const values = byTitle.get(normalizeTitle(entry.item.canonicalTitle)) ?? [];
    values.push(entry);
    byTitle.set(normalizeTitle(entry.item.canonicalTitle), values);
  }
  const rawWarbondPages = raw.pages.filter(
    (page) =>
      /warbond/iu.test(page.title) &&
      /===+\s*Page\s*\d+/iu.test(page.wikitext ?? ""),
  );
  const candidatesByPage = new Map(
    rawWarbondPages.map((page) => [
      page.pageid,
      extractWarbondCandidates(page),
    ]),
  );
  const allRawCandidates = [...candidatesByPage.values()].flat();
  const tableByTitleCost = new Map();
  const tableByTitle = new Map();
  for (const candidate of allRawCandidates.filter(
    (entry) => entry.sourceKind === "contents-table" && entry.canonicalTitle,
  )) {
    const titleKey = `${candidate.sourcePageId}:${candidate.page}:${normalizeTitle(candidate.canonicalTitle)}`;
    const costKey = `${titleKey}:${candidate.itemMedals ?? "unknown"}`;
    const byCost = tableByTitleCost.get(costKey) ?? [];
    byCost.push(candidate);
    tableByTitleCost.set(costKey, byCost);
    const byName = tableByTitle.get(titleKey) ?? [];
    byName.push(candidate);
    tableByTitle.set(titleKey, byName);
  }
  const explicitNonProductTitles = new Set([
    "super credits",
    "ranks",
    "title",
    "cosmetics",
  ]);
  const records = [];
  for (const warbondPage of rawWarbondPages) {
    for (const candidate of candidatesByPage.get(warbondPage.pageid) ?? []) {
      const titleMatches =
        byTitle.get(normalizeTitle(candidate.canonicalTitle)) ?? [];
      const correction = correctionIndex.index.get(
        correctionKey(
          candidate.warbondId,
          candidate.page,
          candidate.canonicalTitle,
        ),
      );
      const correlationKey = `${candidate.sourcePageId}:${candidate.page}:${normalizeTitle(candidate.canonicalTitle)}`;
      const bodyTable = (
        tableByTitleCost.get(
          `${correlationKey}:${candidate.itemMedals ?? "unknown"}`,
        ) ?? []
      ).find(
        (entry) => /armor/iu.test(entry.type) && !/helmet/iu.test(entry.type),
      );
      const nonProductRows = (tableByTitle.get(correlationKey) ?? [])
        .filter((entry) => typeIsExcluded(entry.type))
        .filter(
          (entry) =>
            !candidate.rewardKind || entry.rewardKind === candidate.rewardKind,
        );
      const nonProductTable =
        nonProductRows.length === 1 ? nonProductRows[0] : null;
      const nonProductRowsAmbiguous = nonProductRows.length > 1;
      const nonProductSourceConflict =
        candidate.sourceKind === "acquisitions-template" &&
        nonProductRows.length === 1 &&
        nonProductTable &&
        candidate.itemMedals != null &&
        nonProductTable.itemMedals != null &&
        candidate.itemMedals !== nonProductTable.itemMedals;
      let status = "unresolved";
      let reason = "no-exact-canonical-title";
      let canonicalId = null;
      let resolutionMode = "unresolved";
      let typeWarning = null;
      let corroboratedByCandidateId = null;
      let sourceAmbiguity = null;
      let target = null;
      const templateImageNonProduct =
        candidate.sourceKind === "acquisitions-template" &&
        /helmet|cape|player\s*card|pattern|emote|title|currency|booster/iu.test(
          candidate.image ?? "",
        );
      if (candidate.linkedCanonical === false) {
        if (typeIsExcluded(candidate.type)) {
          status = "excluded";
          reason = "unlinked-row-explicitly-non-product-type";
        } else {
          status = "unresolved";
          reason = "contents-row-missing-item-link";
        }
      } else if (typeIsExcluded(candidate.type)) {
        status = "excluded";
        reason = "out-of-product-row-type";
      } else if (
        candidate.sourceKind === "acquisitions-template" &&
        bodyTable &&
        titleMatches.length === 1 &&
        titleMatches[0].scope.productKind === "body-armor"
      ) {
        status = "duplicate";
        reason = "corroborated-by-contents-table-body-row";
        canonicalId = titleMatches[0].item.id;
        resolutionMode = "corroborated-contents-table";
        corroboratedByCandidateId = bodyTable.candidateId;
      } else if (
        candidate.sourceKind === "acquisitions-template" &&
        (nonProductRowsAmbiguous ||
          nonProductTable ||
          templateImageNonProduct ||
          explicitNonProductTitles.has(
            normalizeTitle(candidate.canonicalTitle),
          ))
      ) {
        if (nonProductRowsAmbiguous) {
          status = "excluded-with-source-ambiguity";
          reason = "multiple-same-kind-non-product-rows";
          sourceAmbiguity = {
            candidateIds: nonProductRows
              .map((entry) => entry.candidateId)
              .sort(),
            rewardKind: candidate.rewardKind ?? null,
            sourcePageId: candidate.sourcePageId,
            page: candidate.page,
          };
        } else {
          status = nonProductSourceConflict
            ? "excluded-with-source-conflict"
            : "excluded";
          reason = nonProductSourceConflict
            ? "non-product-page-cost-conflict"
            : nonProductTable
              ? "corroborated-by-contents-table-non-product-type"
              : templateImageNonProduct
                ? "template-image-explicitly-non-product"
                : "explicit-non-product-title";
          corroboratedByCandidateId = nonProductTable?.candidateId ?? null;
        }
      } else if (correction) {
        target = resolution.byId.get(correction.targetId);
        if (target?.scope.scopeClass === "required") {
          status = "resolved";
          reason = "explicit-source-bound-correction";
          canonicalId = correction.targetId;
          resolutionMode = "correction";
        } else {
          status = "unresolved";
          reason = "correction-target-not-released-required";
        }
      } else if (titleMatches.length > 1) {
        const typeMatches = titleMatches.filter((entry) =>
          typeCompatible(candidate.type, entry),
        );
        if (typeMatches.length === 1) {
          target = typeMatches[0];
          ({ status, reason, canonicalId, resolutionMode, typeWarning } =
            resolveExactCandidate(candidate, target));
        } else {
          status = "ambiguous";
          reason =
            typeMatches.length > 1
              ? "multiple-type-compatible-canonical-pages"
              : "multiple-exact-canonical-pages-no-type-disambiguation";
        }
      } else if (titleMatches.length === 1) {
        target = titleMatches[0];
        ({ status, reason, canonicalId, resolutionMode, typeWarning } =
          resolveExactCandidate(candidate, target));
      } else if (typeIsExcluded(candidate.type)) {
        status = "excluded";
        reason = "explicitly-non-product-row-type";
      }
      records.push({
        candidateId: candidate.candidateId,
        sourcePageId: candidate.sourcePageId,
        sourceRevision: candidate.sourceRevision,
        sourceKind: candidate.sourceKind,
        warbondId: candidate.warbondId,
        page: candidate.page,
        canonicalTitle: candidate.canonicalTitle,
        type: candidate.type,
        image: candidate.image ?? null,
        rewardKind: candidate.rewardKind ?? null,
        itemMedals: candidate.itemMedals,
        disposition: status,
        reason,
        resolutionMode,
        canonicalId,
        typeWarning,
        corroboratedByCandidateId,
        sourceConflict: nonProductSourceConflict
          ? {
              templateItemMedals: candidate.itemMedals,
              tableItemMedals: nonProductTable.itemMedals,
              tableCandidateId: nonProductTable.candidateId,
              tableType: nonProductTable.type,
            }
          : null,
        sourceAmbiguity,
        sourceBinding: pageRef(warbondPage, "contents-candidate"),
      });
    }
  }
  const duplicateKeys = new Set();
  for (const record of records) {
    if (record.disposition !== "resolved") continue;
    const key = `${record.warbondId}:${record.page}:${record.canonicalId}:${record.itemMedals}:${record.type}`;
    if (duplicateKeys.has(key)) {
      record.disposition = "duplicate";
      record.reason = "duplicate-raw-candidate";
    } else duplicateKeys.add(key);
  }
  return records.sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
}

export function expectedWarbondSets(
  candidateRecords,
  catalog,
  resolution = null,
) {
  const byBond = new Map();
  const upcomingByBond = new Map();
  for (const record of candidateRecords) {
    if (record.disposition === "upcoming" && record.canonicalId) {
      const list = upcomingByBond.get(record.warbondId) ?? [];
      list.push(record);
      upcomingByBond.set(record.warbondId, list);
      continue;
    }
    if (
      !["resolved", "duplicate"].includes(record.disposition) ||
      !record.canonicalId ||
      record.disposition === "duplicate"
    )
      continue;
    const list = byBond.get(record.warbondId) ?? [];
    list.push(record);
    byBond.set(record.warbondId, list);
  }
  const formalByBond = new Map();
  for (const item of catalog.items ?? []) {
    const acquisition = item.acquisition;
    if (acquisition?.kind !== "warbond") continue;
    const list = formalByBond.get(acquisition.warbondId) ?? [];
    list.push({
      canonicalId: item.id,
      page: acquisition.page,
      itemMedals: acquisition.itemMedals,
    });
    formalByBond.set(acquisition.warbondId, list);
  }
  const releasedBondIds = [
    ...new Set([...byBond.keys(), ...formalByBond.keys()]),
  ].filter((warbondId) => !upcomingByBond.get(warbondId)?.length);
  const bonds = [
    ...new Set([
      ...byBond.keys(),
      ...formalByBond.keys(),
      ...upcomingByBond.keys(),
    ]),
  ].sort();
  return bonds.map((warbondId) => {
    const expectedRecords = byBond.get(warbondId) ?? [];
    const expectedIds = [
      ...new Set(expectedRecords.map((record) => record.canonicalId)),
    ].sort();
    const formalIds = [
      ...new Set(
        (formalByBond.get(warbondId) ?? []).map((record) => record.canonicalId),
      ),
    ].sort();
    const expectedMap = new Map();
    for (const record of expectedRecords) {
      const current = expectedMap.get(record.canonicalId) ?? [];
      current.push({
        page: record.page,
        itemMedals: record.itemMedals,
        candidateId: record.candidateId,
        canonicalTitle: record.canonicalTitle,
      });
      expectedMap.set(record.canonicalId, current);
    }
    const formalMap = new Map();
    for (const record of formalByBond.get(warbondId) ?? []) {
      const current = formalMap.get(record.canonicalId) ?? [];
      current.push({ page: record.page, itemMedals: record.itemMedals });
      formalMap.set(record.canonicalId, current);
    }
    const uniqueOffers = (offers) =>
      [
        ...new Map(
          offers.map((offer) => [
            `${offer.page}:${offer.itemMedals}`,
            { page: offer.page, itemMedals: offer.itemMedals },
          ]),
        ).values(),
      ].sort(
        (left, right) =>
          left.page - right.page ||
          (left.itemMedals ?? -1) - (right.itemMedals ?? -1),
      );
    const rawOfferConflicts = [...expectedMap.entries()]
      .map(([canonicalId, offers]) => ({
        canonicalId,
        offers: uniqueOffers(offers),
      }))
      .filter((entry) => entry.offers.length > 1);
    const offerMismatches = normalizeSet([
      ...new Set([...expectedMap.keys(), ...formalMap.keys()]),
    ])
      .map((canonicalId) => ({
        canonicalId,
        expected: uniqueOffers(expectedMap.get(canonicalId) ?? []),
        actual: uniqueOffers(formalMap.get(canonicalId) ?? []),
      }))
      .filter(
        (entry) =>
          canonicalJson(entry.expected) !== canonicalJson(entry.actual),
      );
    return {
      warbondId,
      released: releasedBondIds.includes(warbondId),
      upcomingIds: normalizeSet(
        (upcomingByBond.get(warbondId) ?? []).map(
          (record) => record.canonicalId,
        ),
      ),
      expectedIds,
      formalIds,
      missingIds: expectedIds.filter((id) => !formalIds.includes(id)),
      extraIds: formalIds.filter((id) => !expectedIds.includes(id)),
      expectedOffers: [...expectedMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([canonicalId, offers]) => ({ canonicalId, offers })),
      actualOffers: [...formalMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([canonicalId, offers]) => ({
          canonicalId,
          offers: uniqueOffers(offers),
        })),
      rawOfferConflicts,
      offerMismatches,
      mismatchedOffers: offerMismatches,
      offerDiffCount: offerMismatches.length,
      exactSet:
        expectedIds.length === formalIds.length &&
        expectedIds.every((id, index) => id === formalIds[index]) &&
        rawOfferConflicts.length === 0 &&
        offerMismatches.length === 0,
    };
  });
}

export function normalizeSet(values) {
  return [...new Set(values)].sort();
}

export function setDiff(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missingIds: normalizeSet(expected.filter((id) => !actualSet.has(id))),
    extraIds: normalizeSet(actual.filter((id) => !expectedSet.has(id))),
  };
}

export function buildScopeSummary(resolution, catalog) {
  const expected = resolution.equipmentRecords.filter(
    (record) => record.scope.scopeClass === "required",
  );
  const upcoming = resolution.equipmentRecords.filter(
    (record) => record.scope.scopeClass === "upcoming",
  );
  const excluded = resolution.equipmentRecords.filter(
    (record) => record.scope.scopeClass === "out-of-product-scope",
  );
  const expectedIds = normalizeSet(expected.map((record) => record.item.id));
  const formalIds = normalizeSet((catalog.items ?? []).map((item) => item.id));
  const diff = setDiff(expectedIds, formalIds);
  const scopeById = new Map(
    resolution.equipmentRecords.map((record) => [record.item.id, record.scope]),
  );
  const unexpected = classifyFormalCatalogUnexpectedIds(
    formalIds,
    expectedIds,
    scopeById,
  );
  const groups = {};
  for (const record of [...expected, ...upcoming, ...excluded]) {
    const key = record.scope.productKind ?? `excluded:${record.item.category}`;
    const entry = groups[key] ?? {
      expected: 0,
      formal: 0,
      upcoming: 0,
      excluded: 0,
      missingIds: [],
      extraIds: [],
    };
    if (record.scope.scopeClass === "required") entry.expected += 1;
    if (record.scope.scopeClass === "upcoming") entry.upcoming += 1;
    if (record.scope.scopeClass === "out-of-product-scope") entry.excluded += 1;
    groups[key] = entry;
  }
  for (const id of formalIds) {
    const record = resolution.byId.get(id);
    const key = record?.scope.productKind ?? `unknown:${id}`;
    groups[key] ??= {
      expected: 0,
      formal: 0,
      upcoming: 0,
      excluded: 0,
      missingIds: [],
      extraIds: [],
    };
    groups[key].formal += 1;
  }
  for (const id of diff.missingIds)
    groups[
      resolution.byId.get(id)?.scope.productKind ?? "unknown"
    ].missingIds.push(id);
  for (const detail of unexpected)
    groups[
      resolution.byId.get(detail.id)?.scope.productKind ??
        `unknown:${detail.id}`
    ].extraIds.push(detail.id);
  for (const value of Object.values(groups)) {
    value.missingIds.sort();
    value.extraIds.sort();
  }
  return {
    expectedIds,
    formalIds,
    upcomingIds: normalizeSet(upcoming.map((record) => record.item.id)),
    excludedIds: normalizeSet(excluded.map((record) => record.item.id)),
    diff,
    unexpected,
    groups,
  };
}

export function sourceInputSummary(
  raw,
  normalizedDiff,
  catalogDiff,
  localizationDiff,
  communityDiff,
  rawByteHash = null,
  diffByteHashes = {},
) {
  return {
    rawSnapshot: {
      path: "src/data/source/wiki-raw.json",
      byteSha256: rawByteHash ?? sha256(JSON.stringify(raw)),
      pageSetSha256: sha256(
        raw.pages
          .map((page) => ({
            pageId: page.pageid,
            revision: page.revid,
            title: page.title,
            wikitext: page.wikitext,
          }))
          .sort((left, right) => left.pageId - right.pageId),
      ),
      pageCount: raw.pages.length,
      rawSnapshotComplete: raw.rawSnapshotComplete === true,
    },
    diffOnly: {
      normalized: {
        path: "src/data/source/wiki-normalized.json",
        byteSha256:
          diffByteHashes.normalized ?? sha256(JSON.stringify(normalizedDiff)),
        itemCount: normalizedDiff.items?.length ?? 0,
      },
      catalog: {
        path: "src/data/catalog.json",
        byteSha256:
          diffByteHashes.catalog ?? sha256(JSON.stringify(catalogDiff)),
        formalItemCount: catalogDiff.items?.length ?? 0,
      },
      communityAliases: {
        path: "src/data/source/xiaoheihe-community-aliases.json",
        byteSha256:
          diffByteHashes.communityAliases ??
          sha256(JSON.stringify(communityDiff)),
        role: "diff-only-not-raw-fact",
      },
    },
    correctionEvidenceOnly: {
      officialLocalization: {
        path: "src/data/source/official-localization.json",
        byteSha256:
          diffByteHashes.officialLocalization ??
          sha256(JSON.stringify(localizationDiff)),
        role: "correction-evidence-only-sealed-derived-snapshot",
        originalStringsInRepo: false,
        requiresLocalRehashBeforeRelease: true,
      },
    },
  };
}

export { correctionsConfig, fixtureConfig };
