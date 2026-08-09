import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const readJson = async (name) =>
  JSON.parse(await readFile(resolve(root, name), "utf8"));
const schemaNames = [
  "source-ledger.schema.json",
  "corrections.schema.json",
  "resolved-catalog.schema.json",
  "runtime.schema.json",
  "plan.schema.json",
  "audit.schema.json",
];
const schemas = new Map(
  await Promise.all(
    schemaNames.map(async (name) => [name, await readJson(name)]),
  ),
);
const fixture = await readJson("fixtures/contract-cases.json");
// Node 24's built-in TypeScript type stripping imports the same authority used by the project.
// This avoids relying on the removed TypeScript 5.x transpileModule API.
const model = await import(new URL("./model.ts", import.meta.url));

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function refSchema(ref, rootSchema, currentName) {
  const [refName, pointer = ""] = ref.split("#");
  const document = refName
    ? (schemas.get(refName) ??
      fail(currentName, `unknown schema ref ${refName}`))
    : rootSchema;
  let value = document;
  for (const part of pointer.replace(/^\//u, "").split("/").filter(Boolean))
    value = value[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  return [value, document, refName || currentName];
}

function check(schema, value, path, rootSchema, schemaName) {
  if (!schema || typeof schema !== "object") fail(path, "missing schema node");
  if (schema.$ref) {
    const [target, targetRoot, targetName] = refSchema(
      schema.$ref,
      rootSchema,
      schemaName,
    );
    return check(target, value, path, targetRoot, targetName);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => {
      try {
        check(candidate, value, path, rootSchema, schemaName);
        return true;
      } catch {
        return false;
      }
    }).length;
    if (matches !== 1) fail(path, `oneOf matched ${matches} branches`);
  }
  if (schema.allOf)
    for (const candidate of schema.allOf)
      check(candidate, value, path, rootSchema, schemaName);
  if (schema.if) {
    let matched = true;
    try {
      check(schema.if, value, path, rootSchema, schemaName);
    } catch {
      matched = false;
    }
    if (matched && schema.then)
      check(schema.then, value, path, rootSchema, schemaName);
    if (!matched && schema.else)
      check(schema.else, value, path, rootSchema, schemaName);
  }
  if (schema.const !== undefined && !Object.is(value, schema.const))
    fail(path, `expected ${schema.const}`);
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value)))
    fail(path, "not in enum");
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const valid = types.some((type) =>
      type === "null"
        ? value === null
        : type === "array"
          ? Array.isArray(value)
          : type === "object"
            ? value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            : type === "string"
              ? typeof value === "string"
              : type === "number"
                ? typeof value === "number" && Number.isFinite(value)
                : type === "integer"
                  ? Number.isInteger(value)
                  : type === "boolean"
                    ? typeof value === "boolean"
                    : false,
    );
    if (!valid) fail(path, `expected ${types.join("|")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      fail(path, "string too short");
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
      fail(path, "pattern mismatch");
    if (schema.format === "uri") {
      try {
        if (!new URL(value).protocol) fail(path, "invalid uri");
      } catch {
        fail(path, "invalid uri");
      }
    }
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(value) ||
        Number.isNaN(Date.parse(value)))
    )
      fail(path, "invalid date-time");
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      fail(path, "below minimum");
    if (schema.maximum !== undefined && value > schema.maximum)
      fail(path, "above maximum");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(path, "too few items");
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => canonicalJson(item))).size !== value.length
    )
      fail(path, "items are not unique");
    if (schema.items)
      value.forEach((item, index) =>
        check(schema.items, item, `${path}[${index}]`, rootSchema, schemaName),
      );
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? [])
      if (!(key in value)) fail(path, `missing ${key}`);
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!(key in (schema.properties ?? {})))
          fail(`${path}.${key}`, "additional property");
    for (const [key, child] of Object.entries(schema.properties ?? {}))
      if (key in value)
        check(child, value[key], `${path}.${key}`, rootSchema, schemaName);
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    )
      for (const [key, child] of Object.entries(value))
        if (!(key in (schema.properties ?? {})))
          check(
            schema.additionalProperties,
            child,
            `${path}.${key}`,
            rootSchema,
            schemaName,
          );
  }
}

function canonicalize(value, omitRootKey, atRoot = true) {
  if (Array.isArray(value))
    return value.map((entry) => canonicalize(entry, omitRootKey, false));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !(atRoot && key === omitRootKey))
      .sort()
      .map((key) => [key, canonicalize(value[key], omitRootKey, false)]),
  );
}
function canonicalJson(value, omitRootKey) {
  return JSON.stringify(canonicalize(value, omitRootKey));
}
function sha256(value, omitRootKey) {
  return createHash("sha256")
    .update(
      typeof value === "string" ? value : canonicalJson(value, omitRootKey),
    )
    .digest("hex");
}
function expectReject(label, fn) {
  assert.throws(fn, undefined, `${label} must reject`);
  negativeAssertions += 1;
}

let negativeAssertions = 0;
let positiveAssertions = 0;
function markPositive(count = 1) {
  positiveAssertions += count;
}

function assertSchemaDocuments() {
  for (const [name, schema] of schemas) {
    assert.equal(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
      `${name} draft`,
    );
    assert.equal(schema.type, "object", `${name} root type`);
  }
  assert.equal(fixture.syntheticOnly, true, "fixtures must be synthetic");
  assert.equal(fixture.schemaVersion, "contract-cases.v3");
  assert.ok(
    fixture.cases.length >= 17,
    "fixture coverage is unexpectedly small",
  );
}

function assertLedgerReferences(rawLedger) {
  const snapshotIds = new Set();
  for (const snapshot of rawLedger.snapshots) {
    if (snapshotIds.has(snapshot.sourceId))
      throw new Error(`duplicate-snapshot-id:${snapshot.sourceId}`);
    snapshotIds.add(snapshot.sourceId);
  }
  const factIds = new Set();
  for (const fact of rawLedger.facts) {
    if (factIds.has(fact.factId))
      throw new Error(`duplicate-fact-id:${fact.factId}`);
    factIds.add(fact.factId);
    if (!snapshotIds.has(fact.sourceId))
      throw new Error(`fact-source-missing:${fact.factId}`);
  }
  const candidateIds = new Set();
  for (const candidate of rawLedger.candidates) {
    if (candidateIds.has(candidate.candidateId))
      throw new Error(`duplicate-candidate-id:${candidate.candidateId}`);
    candidateIds.add(candidate.candidateId);
    if (!snapshotIds.has(candidate.sourceId) || !candidate.factIds?.length)
      throw new Error(
        `candidate-reference-incomplete:${candidate.candidateId}`,
      );
    for (const factId of candidate.factIds) {
      const fact = rawLedger.facts.find((entry) => entry.factId === factId);
      if (!fact || fact.sourceId !== candidate.sourceId)
        throw new Error(
          `candidate-fact-reference-invalid:${candidate.candidateId}`,
        );
    }
    if (!candidate.disposition?.status)
      throw new Error(`candidate-disposition-missing:${candidate.candidateId}`);
  }
}

const contentHash = sha256("synthetic-source-content");
const sourceSnapshot = {
  sourceId: "fixture-source",
  kind: "wiki",
  authority: "wiki",
  locator: { uri: "https://example.invalid/fixture" },
  capturedAt: "2026-08-09T00:00:00.000Z",
  sha256: contentHash,
  contentType: "wikitext",
};
const manifestHash = sha256({
  sourceId: sourceSnapshot.sourceId,
  sha256: sourceSnapshot.sha256,
});
const facts = [];
function addFact(subject, fieldPath, value, options = {}) {
  const factId = `fixture-fact-${facts.length + 1}`;
  facts.push({
    factId,
    subject,
    fieldPath,
    value,
    sourceId: "fixture-source",
    locator: {
      uri: "https://example.invalid/fixture",
      ...(options.locale ? { locale: options.locale } : {}),
    },
    extractorId: "fixture",
    extractorVersion: "1",
  });
  return factId;
}
function knownEvidence(path, value, options = {}) {
  return {
    fieldEvidenceId: `fixture-evidence-${facts.length + 1}`,
    fieldPath: path,
    status: "known",
    factIds: [addFact(options.subject ?? "fixture", path, value, options)],
    resolvedValueHash: sha256(value),
  };
}
function notApplicableEvidence(path, reason) {
  return {
    fieldEvidenceId: `fixture-evidence-na-${path}`,
    fieldPath: path,
    status: "not-applicable",
    reason,
  };
}

const placeholderAsset = {
  assetId: "fixture-placeholder",
  path: "assets/placeholder.svg",
  sha256: contentHash,
  sourceEvidenceId: "fixture-fact-asset",
  licenseEligible: false,
  displayEligibility: "placeholder",
};
const mg = {
  id: "fixture-mg",
  productKind: "support-weapon",
  model: "MG-43",
  nameZhHans: "合成机枪",
  nameEn: "Synthetic MG",
  currentAcquisition: { kind: "default" },
  combat: {
    weaponClass: "machine-gun",
    ammoTraits: ["ballistic"],
    components: [
      {
        componentId: "fixture-direct",
        role: "direct",
        label: "Direct",
        armorPenetration: { kind: "scalar", value: 0 },
      },
      {
        componentId: "fixture-explosion",
        role: "explosion",
        label: "Explosion",
        armorPenetration: { kind: "scalar", value: 10 },
        demolition: { kind: "range", min: 30, max: 40 },
      },
    ],
    handling: { capacity: { value: 10, kind: "rounds" }, recoil: 2 },
  },
  imageAssetId: placeholderAsset.assetId,
  wikiUrl: "https://helldivers.wiki.gg/wiki/Synthetic_MG",
  fieldEvidence: [],
};
const reward = {
  id: "fixture-reward",
  productKind: "primary-weapon",
  model: "FIX-1",
  nameZhHans: "合成武器",
  nameEn: "Synthetic Reward",
  currentAcquisition: {
    kind: "warbond",
    warbondId: "fixture-warbond",
    page: 1,
    itemMedals: 0,
  },
  imageAssetId: placeholderAsset.assetId,
  wikiUrl: "https://helldivers.wiki.gg/wiki/Synthetic_Reward",
  fieldEvidence: [],
};
function addEquipmentEvidence(item) {
  const prefix = `equipment[id=${item.id}]`;
  const fields = [
    ["nameZhHans", item.nameZhHans, { locale: "zh-Hans" }],
    ["nameEn", item.nameEn, { locale: "en" }],
    ["productKind", item.productKind, {}],
    ["currentAcquisition", item.currentAcquisition, {}],
    ["imageAssetId", item.imageAssetId, {}],
    ["wikiUrl", item.wikiUrl, {}],
    ...(item.model ? [["model", item.model, { locale: "en" }]] : []),
  ];
  item.fieldEvidence.push(
    ...fields.map(([path, value, options]) =>
      knownEvidence(`${prefix}.${path}`, value, {
        subject: item.id,
        ...options,
      }),
    ),
  );
  if (item.combat) {
    item.fieldEvidence.push(
      ...[
        ["weaponClass", item.combat.weaponClass],
        ["ammoTraits", item.combat.ammoTraits],
        ["handling.capacity", item.combat.handling?.capacity],
        ["handling.recoil", item.combat.handling?.recoil],
      ]
        .filter(([, value]) => value !== undefined)
        .map(([path, value]) =>
          knownEvidence(`${prefix}.combat.${path}`, value, {
            subject: item.id,
          }),
        ),
    );
    for (const component of item.combat.components ?? []) {
      const componentPrefix = `${prefix}.combat.components[componentId=${component.componentId}]`;
      for (const [path, value] of Object.entries(component))
        if (value !== undefined)
          item.fieldEvidence.push(
            knownEvidence(`${componentPrefix}.${path}`, value, {
              subject: item.id,
            }),
          );
    }
    item.fieldEvidence.push(
      notApplicableEvidence(`${prefix}.armor`, "combat fixture"),
      notApplicableEvidence(`${prefix}.deployment`, "combat fixture"),
    );
  } else {
    item.fieldEvidence.push(
      notApplicableEvidence(`${prefix}.combat`, "not a combat fixture"),
      notApplicableEvidence(`${prefix}.armor`, "not an armor fixture"),
      notApplicableEvidence(`${prefix}.deployment`, "not a deployment fixture"),
    );
  }
}
addEquipmentEvidence(mg);
addEquipmentEvidence(reward);

const warbond = {
  id: "fixture-warbond",
  nameZhHans: "合成债券",
  nameEn: "Synthetic Warbond",
  purchaseSuperCredits: 100,
  fieldEvidence: [],
};
warbond.fieldEvidence.push(
  knownEvidence("warbonds[id=fixture-warbond].nameZhHans", warbond.nameZhHans, {
    subject: warbond.id,
    locale: "zh-Hans",
  }),
);
warbond.fieldEvidence.push(
  knownEvidence("warbonds[id=fixture-warbond].nameEn", warbond.nameEn, {
    subject: warbond.id,
    locale: "en",
  }),
);
warbond.fieldEvidence.push(
  knownEvidence(
    "warbonds[id=fixture-warbond].purchaseSuperCredits",
    warbond.purchaseSuperCredits,
    { subject: warbond.id },
  ),
);
const page = {
  pageId: "fixture-page-1",
  warbondId: warbond.id,
  page: 1,
  cumulativePrerequisiteMedals: 0,
  fieldEvidence: [],
};
page.fieldEvidence.push(
  knownEvidence(
    "warbondPages[pageId=fixture-page-1].cumulativePrerequisiteMedals",
    0,
    { subject: page.pageId },
  ),
);
const aliasEvidence = knownEvidence(
  "aliases[aliasId=fixture-alias].text",
  "Synthetic MG Alias",
  { subject: "fixture-alias" },
);
const catalogAlias = {
  aliasId: "fixture-alias",
  text: "Synthetic MG Alias",
  targetIds: [mg.id],
  locale: "en",
  kind: "community",
  state: "accepted",
  evidence: aliasEvidence,
};
const pendingAlias = {
  aliasId: "fixture-pending-alias",
  text: "Pending Alias",
  targetIds: [mg.id],
  locale: "en",
  kind: "community",
  state: "pending",
  evidence: notApplicableEvidence(
    "aliases[aliasId=fixture-pending-alias].text",
    "not accepted",
  ),
};
const idAliases = [{ legacyId: "fixture-old-mg", equipmentId: mg.id }];
const ledger = {
  schemaVersion: "raw-ledger.v3",
  inputManifestHash: manifestHash,
  snapshots: [sourceSnapshot],
  facts: [
    ...facts,
    {
      factId: "fixture-fact-asset",
      subject: placeholderAsset.assetId,
      fieldPath: "assets[id=fixture-placeholder].path",
      value: placeholderAsset.path,
      sourceId: "fixture-source",
      locator: { uri: "https://example.invalid/fixture" },
      extractorId: "fixture",
      extractorVersion: "1",
    },
  ],
  candidates: [],
};
ledger.candidates = facts.map((fact) => ({
  candidateId: `candidate-${fact.factId}`,
  subjectHint: fact.subject,
  type: "classification",
  sourceId: fact.sourceId,
  factIds: [fact.factId],
  disposition: { status: "extracted" },
}));
const catalog = {
  schemaVersion: "resolved-catalog.v3",
  catalogVersion: "fixture-1",
  resolvedCatalogHash: "",
  inputManifestHash: ledger.inputManifestHash,
  acquisitionAsOf: "2026-08-09T00:00:00.000Z",
  equipment: [mg, reward],
  aliases: [catalogAlias, pendingAlias],
  idAliases,
  warbonds: [warbond],
  warbondPages: [page],
  assets: [placeholderAsset],
  correctionsHash: "",
};
const correctionFacts = facts.find((fact) =>
  fact.fieldPath.endsWith(".productKind"),
);
const corrections = {
  schemaVersion: "corrections.v3",
  correctionsHash: "",
  corrections: [
    {
      correctionId: "fixture-correction",
      kind: "taxonomy-map",
      target: { entityId: mg.id, fieldPath: "productKind" },
      expectedBefore: mg.productKind,
      sourceBindings: [
        { sourceId: sourceSnapshot.sourceId, sha256: sourceSnapshot.sha256 },
      ],
      evidenceFactIds: [correctionFacts.factId],
      reason: "synthetic same-value taxonomy confirmation",
      reviewer: "fixture-reviewer",
      reviewedAt: "2026-08-09T00:00:00.000Z",
      after: { taxonomy: "product-kind", value: mg.productKind },
    },
  ],
};
corrections.correctionsHash = sha256(corrections, "correctionsHash");
catalog.correctionsHash = corrections.correctionsHash;
catalog.resolvedCatalogHash = sha256(catalog, "resolvedCatalogHash");

function sourceFactsById() {
  return new Map(ledger.facts.map((fact) => [fact.factId, fact]));
}
function valueAtPath(item, path) {
  if (path === "productKind") return item.productKind;
  if (path === "nameZhHans") return item.nameZhHans;
  if (path === "nameEn") return item.nameEn;
  return undefined;
}
function collectProfileLeaves(value, path, result) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    if (path.endsWith(".components"))
      for (const component of value)
        collectProfileLeaves(
          component,
          `${path}[componentId=${component.componentId}]`,
          result,
        );
    else result.set(path, value);
    return;
  }
  if (typeof value !== "object") {
    result.set(path, value);
    return;
  }
  if (
    ["scalar", "range", "variants"].includes(value.kind) ||
    ("value" in value &&
      ["rounds", "charges", "heat", "uses"].includes(value.kind))
  ) {
    result.set(path, value);
    return;
  }
  for (const [key, child] of Object.entries(value))
    collectProfileLeaves(child, `${path}.${key}`, result);
}
function expectedEquipmentFields(item) {
  const prefix = `equipment[id=${item.id}]`;
  const fields = new Map([
    [`${prefix}.nameZhHans`, item.nameZhHans],
    [`${prefix}.nameEn`, item.nameEn],
    [`${prefix}.productKind`, item.productKind],
    [`${prefix}.currentAcquisition`, item.currentAcquisition],
    [`${prefix}.imageAssetId`, item.imageAssetId],
    [`${prefix}.wikiUrl`, item.wikiUrl],
  ]);
  if (item.model) fields.set(`${prefix}.model`, item.model);
  for (const name of ["combat", "armor", "deployment"]) {
    if (item[name])
      collectProfileLeaves(item[name], `${prefix}.${name}`, fields);
  }
  return fields;
}
function assertEvidenceEntry(entry, value, factsById, path) {
  if (entry.status === "known") {
    if (!entry.factIds?.length || !entry.resolvedValueHash)
      throw new Error("known-evidence-incomplete");
    if (entry.resolvedValueHash !== sha256(value))
      throw new Error(`resolved-value-hash-mismatch:${path}`);
    for (const factId of entry.factIds) {
      const fact = factsById.get(factId);
      if (!fact || canonicalJson(fact.value) !== canonicalJson(value))
        throw new Error(`fact-value-mismatch:${path}`);
    }
  }
  if (entry.status === "conflict") {
    if (
      (entry.candidateFactIdGroups?.length ?? 0) < 2 ||
      entry.candidateFactIdGroups.some((group) => !group.length)
    )
      throw new Error("conflict-evidence-incomplete");
    for (const group of entry.candidateFactIdGroups)
      for (const factId of group)
        if (!factsById.has(factId))
          throw new Error(`conflict-fact-missing:${path}`);
  }
}
function assertCatalogEvidence(resolvedCatalog, rawLedger) {
  const factsById = new Map(rawLedger.facts.map((fact) => [fact.factId, fact]));
  for (const item of resolvedCatalog.equipment) {
    const expected = expectedEquipmentFields(item);
    const entries = new Map();
    for (const evidence of item.fieldEvidence) {
      if (entries.has(evidence.fieldPath))
        throw new Error(`duplicate-field-evidence:${evidence.fieldPath}`);
      entries.set(evidence.fieldPath, evidence);
      if (/\[[0-9]+\]/u.test(evidence.fieldPath))
        throw new Error("array-index-field-path");
      if (
        evidence.fieldPath.includes("combat.components") &&
        !/\[componentId=[^\]]+\]/u.test(evidence.fieldPath)
      )
        throw new Error("component-evidence-missing-id");
    }
    for (const [path, value] of expected) {
      const evidence = entries.get(path);
      if (!evidence || evidence.status !== "known")
        throw new Error(`required-field-not-known:${path}`);
      assertEvidenceEntry(evidence, value, factsById, path);
      if (
        path.endsWith(".nameZhHans") &&
        !evidence.factIds.some(
          (factId) => factsById.get(factId)?.locator.locale === "zh-Hans",
        )
      )
        throw new Error(`zh-Hans-evidence-missing:${path}`);
    }
    for (const path of entries.keys())
      if (
        !expected.has(path) &&
        !path.endsWith(".combat") &&
        !path.endsWith(".armor") &&
        !path.endsWith(".deployment")
      )
        throw new Error(`unaccounted-field-evidence:${path}`);
    for (const capability of ["combat", "armor", "deployment"])
      if (!item[capability]) {
        const evidence = entries.get(`equipment[id=${item.id}].${capability}`);
        if (
          !evidence ||
          !["unknown", "not-applicable"].includes(evidence.status)
        )
          throw new Error(
            `missing-absent-capability-evidence:${item.id}.${capability}`,
          );
      }
  }
  for (const bond of resolvedCatalog.warbonds) {
    const prefix = `warbonds[id=${bond.id}]`;
    for (const [field, value] of [
      ["nameZhHans", bond.nameZhHans],
      ["nameEn", bond.nameEn],
      ...(bond.purchaseSuperCredits === undefined
        ? []
        : [["purchaseSuperCredits", bond.purchaseSuperCredits]]),
    ]) {
      const evidence = bond.fieldEvidence.find(
        (entry) => entry.fieldPath === `${prefix}.${field}`,
      );
      if (!evidence || evidence.status !== "known")
        throw new Error(`warbond-field-not-known:${prefix}.${field}`);
      assertEvidenceEntry(evidence, value, factsById, `${prefix}.${field}`);
    }
  }
  for (const bond of resolvedCatalog.warbonds)
    if (bond.purchaseSuperCredits === undefined) {
      const path = `warbonds[id=${bond.id}].purchaseSuperCredits`;
      const evidence = bond.fieldEvidence.find(
        (entry) => entry.fieldPath === path,
      );
      if (!evidence || evidence.status !== "unknown")
        throw new Error(`missing-warbond-price-unknown:${path}`);
    }
  for (const pageEntry of resolvedCatalog.warbondPages) {
    const path = `warbondPages[pageId=${pageEntry.pageId}].cumulativePrerequisiteMedals`;
    const evidence = pageEntry.fieldEvidence.find(
      (entry) => entry.fieldPath === path,
    );
    if (pageEntry.cumulativePrerequisiteMedals === null) {
      if (!evidence || evidence.status !== "unknown")
        throw new Error(`null-page-without-unknown:${path}`);
    } else {
      if (!evidence || evidence.status !== "known")
        throw new Error(`page-not-known:${path}`);
      assertEvidenceEntry(
        evidence,
        pageEntry.cumulativePrerequisiteMedals,
        factsById,
        path,
      );
    }
  }
  for (const asset of resolvedCatalog.assets)
    if (!factsById.has(asset.sourceEvidenceId))
      throw new Error(`asset-source-evidence-missing:${asset.assetId}`);
}
function assertCorrectionsCurrent(file, rawLedger, resolvedCatalog) {
  const snapshots = new Map(
    rawLedger.snapshots.map((snapshot) => [snapshot.sourceId, snapshot]),
  );
  const factsById = sourceFactsById();
  for (const correction of file.corrections) {
    if (!correction.sourceBindings.length || !correction.evidenceFactIds.length)
      throw new Error("correction-evidence-empty");
    for (const binding of correction.sourceBindings) {
      const snapshot = snapshots.get(binding.sourceId);
      if (
        !snapshot ||
        snapshot.sha256 !== binding.sha256 ||
        (binding.revision && snapshot.locator.revision !== binding.revision)
      )
        throw new Error("stale-correction-source-binding");
    }
    for (const factId of correction.evidenceFactIds) {
      const fact = factsById.get(factId);
      if (
        !fact ||
        !correction.sourceBindings.some(
          (binding) => binding.sourceId === fact.sourceId,
        )
      )
        throw new Error("correction-evidence-source-mismatch");
    }
    const item = resolvedCatalog.equipment.find(
      (candidate) => candidate.id === correction.target.entityId,
    );
    const current =
      item && correction.target.fieldPath
        ? valueAtPath(item, correction.target.fieldPath)
        : undefined;
    if (canonicalJson(current) !== canonicalJson(correction.expectedBefore))
      throw new Error("correction-expected-before-mismatch");
  }
}
function assertWarbondGraph(resolvedCatalog) {
  const bondIds = new Set();
  for (const bond of resolvedCatalog.warbonds) {
    if (bondIds.has(bond.id)) throw new Error("duplicate-warbond-id");
    bondIds.add(bond.id);
  }
  const pageKeys = new Set();
  const pageIds = new Set();
  const pagesByBond = new Map();
  for (const pageEntry of resolvedCatalog.warbondPages) {
    const key = `${pageEntry.warbondId}:${pageEntry.page}`;
    if (
      pageKeys.has(key) ||
      pageIds.has(pageEntry.pageId) ||
      !bondIds.has(pageEntry.warbondId)
    )
      throw new Error("invalid-warbond-page-reference");
    pageKeys.add(key);
    pageIds.add(pageEntry.pageId);
    const pages = pagesByBond.get(pageEntry.warbondId) ?? [];
    pages.push(pageEntry);
    pagesByBond.set(pageEntry.warbondId, pages);
  }
  for (const pages of pagesByBond.values()) {
    pages.sort((left, right) => left.page - right.page);
    for (let index = 0; index < pages.length; index += 1)
      if (pages[index].page !== index + 1)
        throw new Error("warbond-pages-not-contiguous");
    if (pages[0]?.cumulativePrerequisiteMedals !== 0)
      throw new Error("warbond-page-one-not-zero");
    let previous = 0;
    for (const pageEntry of pages)
      if (pageEntry.cumulativePrerequisiteMedals !== null) {
        if (pageEntry.cumulativePrerequisiteMedals < previous)
          throw new Error("warbond-prerequisite-not-monotonic");
        previous = pageEntry.cumulativePrerequisiteMedals;
      }
  }
  for (const item of resolvedCatalog.equipment)
    if (item.currentAcquisition.kind === "warbond") {
      if (
        !bondIds.has(item.currentAcquisition.warbondId) ||
        !pageKeys.has(
          `${item.currentAcquisition.warbondId}:${item.currentAcquisition.page}`,
        )
      )
        throw new Error("equipment-warbond-reference-missing");
    }
}
function assertComponentsInCatalog(resolvedCatalog) {
  for (const item of resolvedCatalog.equipment)
    for (const component of item.combat?.components ?? []) {
      if (!component.componentId || !component.label)
        throw new Error("component-identity-missing");
      const components = item.combat?.components ?? [];
      if (
        new Set(components.map((entry) => entry.componentId)).size !==
        components.length
      )
        throw new Error("component-id-duplicate");
      for (const value of [
        component.standardDamage,
        component.durableDamage,
        component.armorPenetration,
        component.demolition,
      ]) {
        if (value?.kind === "range" && value.min > value.max)
          throw new Error("numeric-range-inverted");
        if (value?.kind === "variants") {
          if (
            !value.values.length ||
            new Set(value.values.map((entry) => entry.id)).size !==
              value.values.length
          )
            throw new Error("variants-not-stable");
        }
      }
      const checkNumber = (value, min, max, integer, label) => {
        if (!value) return;
        const numbers =
          value.kind === "scalar"
            ? [value.value]
            : value.kind === "range"
              ? [value.min, value.max]
              : value.values.map((entry) => entry.value);
        if (
          numbers.some(
            (number) =>
              !Number.isFinite(number) ||
              (integer && !Number.isInteger(number)) ||
              number < min ||
              number > max,
          )
        )
          throw new Error(`${label}-out-of-range`);
        if (value.kind === "range" && value.min > value.max)
          throw new Error("numeric-range-inverted");
      };
      checkNumber(component.armorPenetration, 0, 10, true, "ap");
      checkNumber(component.demolition, 0, 50, true, "demolition");
      checkNumber(
        component.standardDamage,
        0,
        Number.POSITIVE_INFINITY,
        false,
        "damage",
      );
      checkNumber(
        component.durableDamage,
        0,
        Number.POSITIVE_INFINITY,
        false,
        "durable-damage",
      );
    }
}
function assertAliasGraph(resolvedCatalog) {
  const equipmentIds = new Set(
    resolvedCatalog.equipment.map((item) => item.id),
  );
  const aliasIds = new Set();
  for (const alias of resolvedCatalog.aliases) {
    if (
      aliasIds.has(alias.aliasId) ||
      alias.targetIds.some((id) => !equipmentIds.has(id))
    )
      throw new Error("alias-graph-invalid");
    aliasIds.add(alias.aliasId);
  }
  const legacyIds = new Set();
  for (const alias of resolvedCatalog.idAliases) {
    if (
      legacyIds.has(alias.legacyId) ||
      equipmentIds.has(alias.legacyId) ||
      !equipmentIds.has(alias.equipmentId)
    )
      throw new Error("id-alias-graph-invalid");
    legacyIds.add(alias.legacyId);
  }
}
function projectCatalog(resolvedCatalog) {
  const assets = new Map(
    resolvedCatalog.assets.map((asset) => [asset.assetId, asset]),
  );
  const acceptedAliases = new Map();
  for (const alias of resolvedCatalog.aliases)
    if (alias.state === "accepted")
      for (const targetId of alias.targetIds) {
        const values = acceptedAliases.get(targetId) ?? [];
        values.push(alias.text);
        acceptedAliases.set(targetId, values);
      }
  const equipment = resolvedCatalog.equipment.map((item) => {
    const asset = assets.get(item.imageAssetId);
    if (!asset || asset.displayEligibility === "blocked")
      throw new Error("blocked-asset-not-projectable");
    return {
      id: item.id,
      ...(item.model ? { model: item.model } : {}),
      nameZhHans: item.nameZhHans,
      nameEn: item.nameEn,
      aliases: [...(acceptedAliases.get(item.id) ?? [])].sort(),
      productKind: item.productKind,
      currentAcquisition: item.currentAcquisition,
      ...(item.combat ? { combat: item.combat } : {}),
      ...(item.armor ? { armor: item.armor } : {}),
      ...(item.deployment ? { deployment: item.deployment } : {}),
      image: {
        assetId: asset.assetId,
        path: asset.path,
        status: asset.displayEligibility === "real" ? "real" : "placeholder",
      },
      wikiUrl: item.wikiUrl,
    };
  });
  return {
    schemaVersion: "runtime-projection.v3",
    catalogVersion: resolvedCatalog.catalogVersion,
    resolvedCatalogHash: resolvedCatalog.resolvedCatalogHash,
    inputManifestHash: resolvedCatalog.inputManifestHash,
    acquisitionAsOf: resolvedCatalog.acquisitionAsOf,
    projectionHash: "",
    ruleVersion: "fixture-projection-1",
    equipment,
    warbonds: resolvedCatalog.warbonds.map(
      ({ fieldEvidence, ...warbond }) => warbond,
    ),
    warbondPages: resolvedCatalog.warbondPages.map(
      ({ fieldEvidence, ...pageEntry }) => pageEntry,
    ),
  };
}
function assertRuntimeProjection(expected, actual) {
  const expectedComparable = { ...expected, projectionHash: "" };
  const actualComparable = { ...actual, projectionHash: "" };
  if (canonicalJson(expectedComparable) !== canonicalJson(actualComparable))
    throw new Error("runtime-projection-mismatch");
  if (actual.projectionHash !== sha256(actual, "projectionHash"))
    throw new Error("projection-hash-mismatch");
}
function assertPlan(plan, catalog, legacyIdMap) {
  if (
    plan.catalogVersion !== catalog.catalogVersion ||
    plan.catalogHash !== catalog.resolvedCatalogHash
  )
    throw new Error("plan-catalog-mismatch");
  const pending = new Set(plan.pendingIds);
  const completed = new Set(plan.completedIds);
  const orphanIds = new Set(plan.orphans.map((orphan) => orphan.equipmentId));
  if (
    [...pending].some((id) => completed.has(id) || orphanIds.has(id)) ||
    [...completed].some((id) => orphanIds.has(id))
  )
    throw new Error("plan-sets-overlap");
  if (orphanIds.size !== plan.orphans.length)
    throw new Error("duplicate-plan-orphan");
  assert.equal(
    legacyIdMap.get("fixture-old-mg"),
    "fixture-mg",
    "id alias migration",
  );
  assert.equal(
    legacyIdMap.get("missing-legacy-id"),
    undefined,
    "missing alias stays orphan candidate",
  );
}
function shouldBlock(audit) {
  return (
    audit.mismatches.some((entry) => entry.severity === "P0") ||
    audit.setReconciliations.some(
      (entry) => entry.missingIds.length || entry.extraIds.length,
    ) ||
    audit.staleCorrections.length > 0 ||
    audit.unaccountedCandidates.length > 0 ||
    !audit.runtimeDiff.matches ||
    audit.migrationDiff.lossyCount > 0
  );
}

assertSchemaDocuments();
markPositive(schemas.size + 3);
const sourceSchema = schemas.get("source-ledger.schema.json");
check(sourceSchema, ledger, "$", sourceSchema, "source-ledger.schema.json");
assertLedgerReferences(ledger);
assert.equal(
  ledger.inputManifestHash,
  manifestHash,
  "ledger input manifest hash",
);
markPositive(2);
expectReject("candidate disposition duplicates factIds", () =>
  check(
    sourceSchema,
    {
      ...ledger,
      candidates: [
        {
          ...ledger.candidates[0],
          disposition: {
            status: "extracted",
            factIds: [ledger.candidates[0].factIds[0]],
          },
        },
      ],
    },
    "$",
    sourceSchema,
    "source-ledger.schema.json",
  ),
);
expectReject("candidate source reference missing", () =>
  assertLedgerReferences({
    ...ledger,
    candidates: [{ ...ledger.candidates[0], sourceId: "missing-source" }],
  }),
);
expectReject("extracted candidate empty facts", () =>
  check(
    sourceSchema,
    { ...ledger, candidates: [{ ...ledger.candidates[0], factIds: [] }] },
    "$",
    sourceSchema,
    "source-ledger.schema.json",
  ),
);

const correctionsSchema = schemas.get("corrections.schema.json");
check(
  correctionsSchema,
  corrections,
  "$",
  correctionsSchema,
  "corrections.schema.json",
);
markPositive(1);
const resolvedSchema = schemas.get("resolved-catalog.schema.json");
check(
  resolvedSchema,
  catalog,
  "$",
  resolvedSchema,
  "resolved-catalog.schema.json",
);
assertCatalogEvidence(catalog, ledger);
assertCorrectionsCurrent(corrections, ledger, catalog);
assert.equal(
  catalog.inputManifestHash,
  ledger.inputManifestHash,
  "catalog input manifest hash",
);
assertAliasGraph(catalog);
assertWarbondGraph(catalog);
assertComponentsInCatalog(catalog);
markPositive(5);
assert.equal(
  catalog.resolvedCatalogHash,
  sha256(catalog, "resolvedCatalogHash"),
  "resolved catalog hash",
);
assert.equal(
  corrections.correctionsHash,
  sha256(corrections, "correctionsHash"),
  "corrections hash",
);

expectReject("stale correction", () =>
  assertCorrectionsCurrent(
    {
      ...corrections,
      corrections: [
        {
          ...corrections.corrections[0],
          sourceBindings: [
            {
              sourceId: "fixture-source",
              sha256:
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          ],
        },
      ],
    },
    ledger,
    catalog,
  ),
);
expectReject("correction with empty evidence", () =>
  assertCorrectionsCurrent(
    {
      ...corrections,
      corrections: [{ ...corrections.corrections[0], evidenceFactIds: [] }],
    },
    ledger,
    catalog,
  ),
);
expectReject("correction with wrong expectedBefore", () =>
  assertCorrectionsCurrent(
    {
      ...corrections,
      corrections: [{ ...corrections.corrections[0], expectedBefore: "wrong" }],
    },
    ledger,
    catalog,
  ),
);
expectReject("component evidence without componentId", () =>
  assertCatalogEvidence(
    {
      ...catalog,
      equipment: [
        {
          ...mg,
          fieldEvidence: [
            ...mg.fieldEvidence,
            knownEvidence(
              `equipment[id=${mg.id}].combat.components[0].armorPenetration`,
              0,
            ),
          ],
        },
        reward,
      ],
    },
    ledger,
  ),
);
expectReject("resolved value hash changed", () =>
  assertCatalogEvidence(
    {
      ...catalog,
      equipment: [
        {
          ...mg,
          fieldEvidence: mg.fieldEvidence.map((entry) =>
            entry.fieldPath.endsWith(".wikiUrl")
              ? {
                  ...entry,
                  resolvedValueHash:
                    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                }
              : entry,
          ),
        },
        reward,
      ],
    },
    ledger,
  ),
);
expectReject("duplicate component id", () =>
  assertComponentsInCatalog({
    ...catalog,
    equipment: [
      {
        ...mg,
        combat: {
          ...mg.combat,
          components: [
            mg.combat.components[0],
            {
              ...mg.combat.components[1],
              componentId: mg.combat.components[0].componentId,
            },
          ],
        },
      },
      reward,
    ],
  }),
);
expectReject("inverted numeric range", () =>
  assertComponentsInCatalog({
    ...catalog,
    equipment: [
      {
        ...mg,
        combat: {
          ...mg.combat,
          components: [
            {
              ...mg.combat.components[1],
              demolition: { kind: "range", min: 40, max: 30 },
            },
          ],
        },
      },
      reward,
    ],
  }),
);
expectReject("empty numeric variants", () =>
  check(
    resolvedSchema,
    {
      ...catalog,
      equipment: [
        {
          ...mg,
          combat: {
            ...mg.combat,
            components: [
              {
                ...mg.combat.components[0],
                armorPenetration: { kind: "variants", values: [] },
              },
            ],
          },
        },
        reward,
      ],
    },
    "$",
    resolvedSchema,
    "resolved-catalog.schema.json",
  ),
);
expectReject("duplicate numeric variant ids", () =>
  assertComponentsInCatalog({
    ...catalog,
    equipment: [
      {
        ...mg,
        combat: {
          ...mg.combat,
          components: [
            {
              ...mg.combat.components[0],
              armorPenetration: {
                kind: "variants",
                values: [
                  { id: "same", label: "A", value: 1 },
                  { id: "same", label: "B", value: 2 },
                ],
              },
            },
          ],
        },
      },
      reward,
    ],
  }),
);

const runtimeExpected = projectCatalog(catalog);
const runtime = {
  ...runtimeExpected,
  projectionHash: sha256(runtimeExpected, "projectionHash"),
};
const runtimeSchema = schemas.get("runtime.schema.json");
check(runtimeSchema, runtime, "$", runtimeSchema, "runtime.schema.json");
assertRuntimeProjection(runtimeExpected, runtime);
markPositive(2);
expectReject("runtime payload changed but hash kept", () =>
  assertRuntimeProjection(runtimeExpected, {
    ...runtime,
    equipment: runtime.equipment.map((item) =>
      item.id === "fixture-mg" ? { ...item, nameEn: "Changed" } : item,
    ),
  }),
);
expectReject("blocked asset cannot project", () =>
  projectCatalog({
    ...catalog,
    assets: [
      {
        ...placeholderAsset,
        displayEligibility: "blocked",
        licenseEligible: false,
      },
    ],
  }),
);

const plan = {
  schemaVersion: "plan.v3",
  catalogVersion: catalog.catalogVersion,
  catalogHash: catalog.resolvedCatalogHash,
  pendingIds: ["fixture-reward"],
  completedIds: [],
  orphans: [
    {
      equipmentId: "missing-legacy-id",
      lastKnownName: "Removed fixture",
      reason: "removed",
    },
  ],
  updatedAt: "2026-08-09T00:00:00.000Z",
};
const planSchema = schemas.get("plan.schema.json");
check(planSchema, plan, "$", planSchema, "plan.schema.json");
assertPlan(
  plan,
  catalog,
  new Map(
    catalog.idAliases.map((entry) => [entry.legacyId, entry.equipmentId]),
  ),
);
markPositive(2);
expectReject("plan pending/completed/orphan overlap", () =>
  assertPlan(
    {
      ...plan,
      orphans: [{ ...plan.orphans[0], equipmentId: "fixture-reward" }],
    },
    catalog,
    new Map(
      catalog.idAliases.map((entry) => [entry.legacyId, entry.equipmentId]),
    ),
  ),
);

const validAudit = {
  schemaVersion: "audit-report.v3",
  catalogVersion: catalog.catalogVersion,
  inputHashes: { source: contentHash, ledger: ledger.inputManifestHash },
  schemaVersionUsed: "v3",
  ruleVersions: { projection: "fixture-projection-1" },
  toolVersions: { runner: "fixture-1" },
  stageCounts: {
    snapshots: 1,
    facts: ledger.facts.length,
    equipment: catalog.equipment.length,
  },
  stageSetHashes: { equipment: catalog.resolvedCatalogHash },
  setReconciliations: [
    {
      reconciliationId: "fixture-equipment",
      missingIds: [],
      extraIds: [],
      expectedHash: catalog.resolvedCatalogHash,
      actualHash: catalog.resolvedCatalogHash,
    },
  ],
  runtimeDiff: {
    matches: true,
    expectedHash: runtime.projectionHash,
    actualHash: runtime.projectionHash,
    changes: [],
  },
  migrationDiff: { lossyCount: 0, changes: [] },
  mismatches: [],
  unknownByReason: {},
  conflicts: [],
  staleCorrections: [],
  unaccountedCandidates: [],
  durationsMs: { runner: 1 },
  cacheHits: { sourceFetch: 0 },
};
const auditSchema = schemas.get("audit.schema.json");
check(auditSchema, validAudit, "$", auditSchema, "audit.schema.json");
assert.equal(shouldBlock(validAudit), false, "clean audit must not block");
markPositive(2);
const blockingAudits = [
  { ...validAudit, mismatches: [{ code: "p0", severity: "P0" }] },
  {
    ...validAudit,
    setReconciliations: [
      { ...validAudit.setReconciliations[0], missingIds: ["missing"] },
    ],
  },
  { ...validAudit, staleCorrections: ["fixture-correction"] },
  { ...validAudit, unaccountedCandidates: ["fixture-candidate"] },
  { ...validAudit, runtimeDiff: { ...validAudit.runtimeDiff, matches: false } },
  { ...validAudit, migrationDiff: { lossyCount: 1, changes: ["lossy"] } },
];
for (const audit of blockingAudits)
  assert.equal(shouldBlock(audit), true, "each blocking audit must block");

expectReject("uri format", () =>
  check(
    resolvedSchema,
    { ...catalog, equipment: [{ ...mg, wikiUrl: "not-a-uri" }, reward] },
    "$",
    resolvedSchema,
    "resolved-catalog.schema.json",
  ),
);
expectReject("date-time format", () =>
  check(
    runtimeSchema,
    { ...runtime, acquisitionAsOf: "not-a-date" },
    "$",
    runtimeSchema,
    "runtime.schema.json",
  ),
);

const fixtureById = new Map(
  fixture.cases.map((entry) => [entry.caseId, entry]),
);
assert.equal(
  fixtureById.get("mg43-exo55-product-kind").expected.mgUiGroup,
  "stratagem",
);
assert.equal(
  fixtureById.get("mg43-exo55-product-kind").expected.exoUiGroup,
  "stratagem",
);
assert.equal(
  fixtureById.get("unknown-is-not-zero").inputs.page
    .cumulativePrerequisiteMedals,
  null,
);
assert.equal(fixtureById.get("runtime-hash-mismatch").expected.blocked, true);
assert.equal(
  model.displayGroupFor("support-weapon"),
  "stratagem",
  "model authority: MG group",
);
assert.equal(
  model.displayGroupFor("other-stratagem"),
  "stratagem",
  "model authority: EXO group",
);
assert.equal(
  model.displayGroupFor("primary-weapon"),
  "weapon",
  "model authority: primary group",
);
markPositive(3);

console.log(
  `v3 contract runner passed: ${fixture.cases.length} synthetic cases, ${schemas.size} schemas, ${positiveAssertions} positive contract assertions, ${negativeAssertions} negative assertions`,
);
