import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  attestationContentHash,
  buildCorrectionIndex,
  buildScopeSummary,
  buildRawResolverContext,
  canonicalJson,
  expectedWarbondSets,
  readJson,
  resolveRawEquipmentPage,
  resolveRawSnapshot,
  resolveWarbondCandidates,
  sha256,
  toolBundleHash,
  validateLocalizationAttestation,
  validateSourceManifestShape,
} from "./migration-common.mjs";
import { fixtureConfig } from "./migration-common.mjs";
import {
  assertFixtureRawCoordinate,
  runResolverFixtures,
} from "./resolver-gate.mjs";
import { probeRawSnapshot } from "./raw-probe.mjs";
import {
  rawTableNegativeCases,
  runRawCriticalValidation,
} from "./raw-validator.mjs";

const root = new URL("../../", import.meta.url);
const rawPath = new URL("src/data/source/wiki-raw.json", root);
const rawBytes = await readFile(rawPath);
const raw = JSON.parse(rawBytes);
const catalog = await readJson(new URL("src/data/catalog.json", root));
const localizationBytes = await readFile(
  new URL("src/data/source/official-localization.json", root),
);
const localization = JSON.parse(localizationBytes);
const localizationByteSha256 = sha256(localizationBytes);
const sourceManifest = await readJson(
  new URL("data/v3/config/source-manifest.json", root),
);
const localizationAttestationBytes = await readFile(
  new URL("data/v3/config/localization-attestation.json", root),
);
const localizationAttestation = JSON.parse(localizationAttestationBytes);
const correctionsConfig = await readJson(
  new URL("data/v3/config/warbond-corrections.json", root),
);
const probe = probeRawSnapshot(raw, rawBytes);
const resolution = resolveRawSnapshot(raw);
const corrections = buildCorrectionIndex(
  resolution,
  undefined,
  localization,
  localizationByteSha256,
);
const candidates = resolveWarbondCandidates(raw, resolution, corrections);
const scope = buildScopeSummary(resolution, catalog);
const warbondSets = expectedWarbondSets(candidates, catalog, resolution);

const counts = { positive: 0, negative: 0 };
function positive(condition, message) {
  counts.positive += 1;
  assert.ok(condition, message);
}
function negative(condition, message) {
  counts.negative += 1;
  assert.ok(condition, message);
}

positive(probe.rawPageCount === 467, "raw page count must be 467");
positive(probe.rawSnapshotComplete, "raw snapshot must be complete");
positive(
  probe.warbondPageCount === 24 && probe.warbondPageSectionCount === 79,
  "warbond source closure must be 24 pages/79 sections",
);
positive(
  JSON.stringify(probe.acquisitionProbe) ===
    JSON.stringify({
      nLink: 545,
      nCost: 545,
      tableRows: 562,
      totalCandidates: 1107,
    }),
  "raw acquisition probe counts must be 545/545/562/1107",
);
positive(
  probe.rawPageRevisionClosure.count === 467 &&
    probe.rawPageRevisionClosure.duplicatePageIds.length === 0,
  "raw page/revision closure must be unique",
);

const dispositionCounts = Object.fromEntries(
  resolution.pageRecords.reduce(
    (map, record) =>
      map.set(record.disposition, (map.get(record.disposition) ?? 0) + 1),
    new Map(),
  ),
);
positive(
  resolution.pageRecords.length === 467,
  "each raw page must have one disposition",
);
positive(
  (dispositionCounts["parse-error"] ?? 0) === 0,
  "raw resolver must have no parse errors",
);
positive(
  resolution.equipmentRecords.length === 321 &&
    resolution.warbondRecords.length === 24,
  "raw resolver must resolve 321 equipment/24 warbonds",
);
positive(
  scope.expectedIds.length === 292 &&
    scope.upcomingIds.length === 6 &&
    scope.excludedIds.length === 23,
  "scope totals must be 292/6/23",
);
positive(
  JSON.stringify(scope.diff) ===
    JSON.stringify({ missingIds: [], extraIds: [] }),
  "formal catalog and raw-derived required scope must be equal",
);

const expectedGroups = {
  "primary-weapon": 51,
  "secondary-weapon": 23,
  grenade: 20,
  "body-armor": 105,
  "support-weapon": 34,
  "other-stratagem": 59,
};
for (const [group, expected] of Object.entries(expectedGroups))
  positive(
    scope.groups[group]?.expected === expected,
    `${group} scope count mismatch`,
  );
positive(
  candidates.length === 1107,
  "every raw warbond candidate must be dispositioned",
);
positive(
  candidates.every((candidate) =>
    [
      "resolved",
      "duplicate",
      "excluded",
      "excluded-with-source-conflict",
      "excluded-with-source-ambiguity",
      "upcoming",
      "ambiguous",
      "unresolved",
    ].includes(candidate.disposition),
  ),
  "candidate disposition enum must be complete",
);
positive(
  candidates.every((candidate) => candidate.sourceBinding?.sourceId),
  "every candidate must retain its raw source binding",
);
positive(
  candidates.some(
    (candidate) =>
      candidate.canonicalTitle === "Still Standing" &&
      candidate.disposition === "excluded",
  ),
  "unlinked Still Standing row must be explicitly rejected as a non-product Title",
);
const cpgHelmetTemplate = candidates.find(
  (candidate) =>
    candidate.sourcePageId === 17209 &&
    candidate.sourceKind === "acquisitions-template" &&
    candidate.canonicalTitle === "CPG-48 Sapper" &&
    candidate.itemMedals === 30,
);
positive(
  cpgHelmetTemplate?.disposition === "excluded-with-source-conflict" &&
    cpgHelmetTemplate.sourceConflict?.tableItemMedals === 35,
  "CPG-48 helmet template/page cost conflict must be excluded with an auditable source conflict",
);
const cpgArmorTemplate = candidates.find(
  (candidate) =>
    candidate.sourcePageId === 17209 &&
    candidate.sourceKind === "acquisitions-template" &&
    candidate.canonicalTitle === "CPG-48 Sapper" &&
    candidate.itemMedals === 45,
);
positive(
  cpgArmorTemplate?.disposition === "duplicate" &&
    cpgArmorTemplate.sourceConflict === null &&
    cpgArmorTemplate.corroboratedByCandidateId === "raw:17209:p1:table:2",
  "CPG-48 armor template must match the body-armor table row, not the same-title helmet row",
);
const freLiberamTemplates = candidates.filter(
  (candidate) =>
    candidate.sourcePageId === 10293 &&
    candidate.sourceKind === "acquisitions-template" &&
    candidate.canonicalTitle === "Fre Liberam",
);
positive(
  freLiberamTemplates.length === 2 &&
    freLiberamTemplates.some(
      (candidate) =>
        candidate.rewardKind === "player-card" && candidate.itemMedals === 2,
    ) &&
    freLiberamTemplates.some(
      (candidate) =>
        candidate.rewardKind === "cape" && candidate.itemMedals === 8,
    ),
  "same-title Fre Liberam templates must retain distinct Player Card/Cape reward kinds",
);
positive(
  freLiberamTemplates.every(
    (candidate) =>
      candidate.disposition !== "excluded-with-source-conflict" &&
      candidate.sourceConflict === null,
  ),
  "same-title Player Card/Cape rows must not create a cross-kind false cost conflict",
);
const sameKindPatternAmbiguity = candidates.find(
  (candidate) =>
    candidate.sourceKind === "acquisitions-template" &&
    candidate.rewardKind === "pattern" &&
    candidate.reason === "multiple-same-kind-non-product-rows",
);
positive(
  sameKindPatternAmbiguity?.disposition === "excluded-with-source-ambiguity" &&
    sameKindPatternAmbiguity.sourceAmbiguity?.candidateIds?.length > 1 &&
    sameKindPatternAmbiguity.sourceAmbiguity.rewardKind === "pattern",
  "multiple same-kind non-product table rows must be explicitly disposed with an auditable ambiguity",
);
const nonProductAmbiguities = candidates.filter(
  (candidate) => candidate.disposition === "excluded-with-source-ambiguity",
);
positive(
  nonProductAmbiguities.length === 25 &&
    nonProductAmbiguities.every(
      (candidate) =>
        candidate.sourceAmbiguity?.candidateIds?.length > 1 &&
        candidate.sourceAmbiguity?.sourcePageId === candidate.sourcePageId &&
        candidate.sourceAmbiguity?.rewardKind === candidate.rewardKind,
    ),
  "all 25 same-kind Pattern ambiguities must retain candidate IDs, reward kind, and raw source coordinates",
);
positive(
  candidates.filter((candidate) => candidate.disposition === "unresolved")
    .length === 0,
  "all remaining raw Contents candidates must be either product-resolved or explicitly non-product",
);
positive(
  candidates.some(
    (candidate) =>
      candidate.canonicalTitle.includes("Guard Dog") &&
      candidate.canonicalId === "ax-tx-13-dog-breath" &&
      candidate.resolutionMode === "correction",
  ),
  "Dog Breath display alias must resolve through its typed correction",
);

const entrenchment = warbondSets.find(
  (set) => set.warbondId === "entrenched-division",
);
const exo = warbondSets.find((set) => set.warbondId === "exo-experts");
positive(
  entrenchment?.expectedIds.length === 8 &&
    entrenchment.expectedIds.includes("cqc-73-entrenchment-tool"),
  "Entrenched raw Contents exact set must contain 8/CQC-73",
);
positive(
  exo?.expectedIds.length === 7 &&
    exo.expectedIds.includes("p-33-missile-pistol"),
  "Exo Experts raw Contents exact set must contain 7/P-33",
);
const releasedWarbondSets = warbondSets.filter((set) => set.released);
positive(
  releasedWarbondSets.every(
    (set) =>
      set.offerMismatches.length === 0 && set.rawOfferConflicts.length === 0,
  ),
  "every released Warbond canonical offer must match raw page/cost and have no raw conflict",
);
positive(
  releasedWarbondSets.reduce((sum, set) => sum + set.expectedIds.length, 0) ===
    167 &&
    releasedWarbondSets.reduce((sum, set) => sum + set.formalIds.length, 0) ===
      167,
  "released Warbond offer reconciliation must cover 167 items on both sides",
);
positive(
  corrections.correctionsApplied.find(
    (correction) =>
      correction.correctionId === "siege-breakers-las-16-to-las-13",
  )?.officialSourceBindings?.length === 2,
  "LAS correction must retain both official localization key bindings",
);

const fixtureRun = runResolverFixtures({
  raw,
  resolution,
  candidateRecords: candidates,
  catalog,
});
positive(
  fixtureRun.passed,
  `resolver fixtures failed: ${fixtureRun.failedFixtureIds.join(", ")}`,
);
const rawValidatorRun = runRawCriticalValidation(raw, warbondSets);
positive(
  rawValidatorRun.passed,
  `independent raw validator failed: ${JSON.stringify(rawValidatorRun.productionDiff)}`,
);
positive(
  rawTableNegativeCases(raw).passed,
  "raw table negative cases must preserve title/type columns and reject first-link selection",
);

const ambiguous = candidates.filter(
  (candidate) => candidate.disposition === "ambiguous",
);
positive(
  ambiguous.length === 0,
  "non-product ambiguity must not remain in the global ambiguous disposition",
);
positive(
  ambiguous.every(
    (candidate) =>
      candidate.canonicalId === null &&
      candidate.resolutionMode === "unresolved",
  ),
  "ambiguous candidates must not fall back to a target",
);
positive(
  candidates.every(
    (candidate) => candidate.resolutionMode !== "first-candidate",
  ),
  "first-candidate fallback is forbidden",
);
positive(
  candidates
    .filter((candidate) => candidate.itemMedals === null)
    .every((candidate) => candidate.disposition !== "resolved"),
  "unknown item cost must not be admitted as resolved",
);

const openTypePage = {
  ...raw.pages[444],
  wikitext: raw.pages[444].wikitext.replace(
    /(\|weapon_type\s*=).*$/imu,
    "$1 Open Type",
  ),
};
const openTypeResult = resolveRawEquipmentPage(
  openTypePage,
  buildRawResolverContext(raw),
);
positive(
  openTypeResult.status === "resolved",
  "unknown/open weapon Type must not be dropped",
);

const reversed = { ...raw, pages: [...raw.pages].reverse() };
const reversedResolution = resolveRawSnapshot(reversed);
const stableRecords = (value) =>
  value
    .map((record) => ({
      id: record.item?.id ?? null,
      pageId: record.page.pageid,
      scope: record.scope?.scopeClass ?? null,
      productKind: record.scope?.productKind ?? null,
    }))
    .sort((left, right) =>
      `${left.id}:${left.pageId}`.localeCompare(`${right.id}:${right.pageId}`),
    );
const stableCandidates = (value) =>
  value
    .map((record) => ({
      candidateId: record.candidateId,
      disposition: record.disposition,
      canonicalId: record.canonicalId,
      page: record.page,
      cost: record.itemMedals,
    }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
const reversedCorrections = buildCorrectionIndex(
  reversedResolution,
  undefined,
  localization,
  localizationByteSha256,
);
const reversedCandidates = resolveWarbondCandidates(
  reversed,
  reversedResolution,
  reversedCorrections,
);
positive(
  canonicalJson(stableRecords(resolution.equipmentRecords)) ===
    canonicalJson(stableRecords(reversedResolution.equipmentRecords)),
  "equipment resolution must be order independent",
);
positive(
  canonicalJson(stableCandidates(candidates)) ===
    canonicalJson(stableCandidates(reversedCandidates)),
  "warbond candidate resolution must be order independent",
);

const staleRaw = {
  ...raw,
  pages: raw.pages.map((page) =>
    page.pageid === 15852 ? { ...page, revid: page.revid + 1 } : page,
  ),
};
const staleResolution = resolveRawSnapshot(staleRaw);
const staleCorrections = buildCorrectionIndex(
  staleResolution,
  undefined,
  localization,
  localizationByteSha256,
);
negative(
  staleCorrections.staleCorrections.length > 0,
  "changed source revision must invalidate correction",
);

const staleWikitextRaw = {
  ...raw,
  pages: raw.pages.map((page) =>
    page.pageid === 15852
      ? { ...page, wikitext: `${page.wikitext}\n<!-- changed -->` }
      : page,
  ),
};
const staleWikitextResolution = resolveRawSnapshot(staleWikitextRaw);
const staleWikitextCorrections = buildCorrectionIndex(
  staleWikitextResolution,
  undefined,
  localization,
  localizationByteSha256,
);
negative(
  staleWikitextCorrections.staleCorrections.some(
    (stale) => stale.correctionId === "siege-breakers-las-16-to-las-13",
  ),
  "changed source wikitext hash must invalidate correction",
);

const tamperedCatalog = structuredClone(catalog);
const tamperedOffer = tamperedCatalog.items.find(
  (item) => item.acquisition?.kind === "warbond",
);
tamperedOffer.acquisition.itemMedals += 1;
const tamperedSets = expectedWarbondSets(
  candidates,
  tamperedCatalog,
  resolution,
);
negative(
  tamperedSets.some((set) =>
    set.offerMismatches.some(
      (mismatch) => mismatch.canonicalId === tamperedOffer.id,
    ),
  ),
  "formal page/cost mutation must produce an offer mismatch",
);

const tamperedLocalization = structuredClone(localization);
const tamperedLocalizationEntry = tamperedLocalization.records.find(
  (record) => record.key === 2350507039,
);
tamperedLocalizationEntry.simplifiedChinese = "LAS-13\u201cchanged\u201d";
const staleLocalizationCorrections = buildCorrectionIndex(
  resolution,
  undefined,
  tamperedLocalization,
  localizationByteSha256,
);
negative(
  staleLocalizationCorrections.staleCorrections.some(
    (stale) => stale.correctionId === "siege-breakers-las-16-to-las-13",
  ),
  "official localization value mutation must invalidate LAS correction",
);

const tamperedLocalizationKey = structuredClone(localization);
tamperedLocalizationKey.records.find(
  (record) => record.key === 2350507039,
).key = 999999999;
const staleKeyCorrections = buildCorrectionIndex(
  resolution,
  undefined,
  tamperedLocalizationKey,
  localizationByteSha256,
);
negative(
  staleKeyCorrections.staleCorrections.some(
    (stale) => stale.correctionId === "siege-breakers-las-16-to-las-13",
  ),
  "official localization key mutation must invalidate LAS correction",
);

const tamperedLocalizationHash = structuredClone(localization);
tamperedLocalizationHash.sourceFiles.find(
  (file) => file.fileName === "0x4f68a1db55e6da09.strings.json",
).sha256 = "tampered";
const staleHashCorrections = buildCorrectionIndex(
  resolution,
  undefined,
  tamperedLocalizationHash,
  localizationByteSha256,
);
negative(
  staleHashCorrections.staleCorrections.some(
    (stale) => stale.correctionId === "siege-breakers-las-16-to-las-13",
  ),
  "official localization file hash mutation must invalidate LAS correction",
);

const staleRegistryCorrections = buildCorrectionIndex(
  resolution,
  undefined,
  localization,
  "tampered-registry-byte-hash",
);
negative(
  staleRegistryCorrections.staleCorrections.some(
    (stale) => stale.correctionId === "siege-breakers-las-16-to-las-13",
  ),
  "official localization registry byte hash mutation must invalidate LAS correction",
);

const badFixtureRaw = {
  ...raw,
  pages: raw.pages.map((page, index) =>
    index === 444 ? { ...page, pageid: page.pageid + 1 } : page,
  ),
};
let badFixtureRejected = false;
try {
  assertFixtureRawCoordinate(
    badFixtureRaw,
    fixtureConfig.fixtures.find((fixture) => fixture.fixtureId === "p-33"),
  );
} catch {
  badFixtureRejected = true;
}
negative(
  badFixtureRejected,
  "fixture coordinate mutation must be rejected by the fixture gate",
);

const maliciousCorrection = {
  correctionId: "malicious-super-credits-gp20",
  warbondId: "servants-of-freedom",
  page: 1,
  contentsTitle: "Super Credits",
  targetId: "gp-20-ultimatum",
  targetCanonicalTitle: "GP-20 Ultimatum",
  fieldPath: "warbond.contents.identity",
  expectedBefore: {
    warbondId: "servants-of-freedom",
    page: 1,
    contentsTitle: "Super Credits",
  },
  after: { canonicalId: "gp-20-ultimatum", canonicalTitle: "GP-20 Ultimatum" },
  reason:
    "negative fixture must not inject a Super Credits row into an equipment identity",
  reviewer: "test",
  reviewedAt: "2026-08-09T00:00:00.000Z",
  sourceBindings: [],
};
const maliciousIndex = buildCorrectionIndex(
  resolution,
  { corrections: [maliciousCorrection] },
  localization,
  localizationByteSha256,
);
negative(
  maliciousIndex.invalidCorrections.some(
    (entry) => entry.correctionId === "malicious-super-credits-gp20",
  ),
  "empty source bindings must reject malicious Super Credits correction",
);
negative(
  ![...maliciousIndex.index.values()].some(
    (entry) => entry.correctionId === "malicious-super-credits-gp20",
  ),
  "invalid correction must never enter correction index",
);

function rawBinding(page, role) {
  return {
    pageId: page.pageid,
    revision: page.revid,
    wikitextSha256: sha256(Buffer.from(page.wikitext ?? "", "utf8")),
    role,
  };
}

function makeSwapCorrection(correctionId, contentsTitle, targetId) {
  const target = resolution.byId.get(targetId);
  const contentsPage = raw.pages.find((page) => page.pageid === 18420);
  return {
    correctionId,
    warbondId: "exo-experts",
    page: 2,
    contentsTitle,
    targetId,
    targetCanonicalTitle: target.item.canonicalTitle,
    fieldPath: "warbond.contents.identity",
    expectedBefore: { warbondId: "exo-experts", page: 2, contentsTitle },
    after: {
      canonicalId: targetId,
      canonicalTitle: target.item.canonicalTitle,
    },
    reason:
      "negative fixture swaps two exact raw Exo Experts rows and must be rejected",
    reviewer: "m1-negative-fixture",
    reviewedAt: "2026-08-09T00:00:00.000Z",
    sourceBindings: [
      rawBinding(target.page, "equipment-page"),
      rawBinding(contentsPage, "contents-page"),
    ],
  };
}

const exoSwapCorrections = [
  makeSwapCorrection(
    "negative-exo-51-to-p-33",
    "EXO-51 Lumberer Exosuit",
    "p-33-missile-pistol",
  ),
  makeSwapCorrection(
    "negative-p-33-to-exo-51",
    "P-33 Missile Pistol",
    "exo-51-lumberer-exosuit",
  ),
];
const exoSwapIndex = buildCorrectionIndex(
  resolution,
  { corrections: exoSwapCorrections },
  localization,
  localizationByteSha256,
);
negative(
  exoSwapIndex.invalidCorrections.length === 2 && exoSwapIndex.index.size === 0,
  "exact raw Exo rows must reject contract-shaped EXO-51/P-33 target swaps",
);
negative(
  exoSwapIndex.invalidCorrections.every((entry) =>
    entry.errors?.includes("correction-target-does-not-match-exact-raw-title"),
  ),
  "Exo swap rejection must identify the exact raw-title target mismatch",
);

positive(
  validateLocalizationAttestation(
    localizationAttestation,
    localization,
    undefined,
    localizationByteSha256,
  ).length === 0 &&
    localizationAttestation.artifactSha256 ===
      attestationContentHash(localizationAttestation),
  "localization attestation must be content-addressed and match registry/LAS evidence",
);
positive(
  validateSourceManifestShape(sourceManifest).length === 0 &&
    sourceManifest.inputs.length === 8,
  "source manifest must have the exact eight required inputs and tool closure",
);
const missingAttestation = validateLocalizationAttestation(
  null,
  localization,
  undefined,
  localizationByteSha256,
);
negative(
  missingAttestation.includes("attestation-not-object"),
  "missing localization attestation must be rejected",
);
const tamperedAttestationHash = structuredClone(localizationAttestation);
tamperedAttestationHash.artifactSha256 = "0".repeat(64);
negative(
  validateLocalizationAttestation(
    tamperedAttestationHash,
    localization,
    undefined,
    localizationByteSha256,
  ).includes("artifact-content-hash-mismatch"),
  "localization attestation self-hash mutation must be rejected",
);
const tamperedAttestationTool = structuredClone(localizationAttestation);
tamperedAttestationTool.extractor.executableSha256 = "0".repeat(64);
negative(
  validateLocalizationAttestation(
    tamperedAttestationTool,
    localization,
    undefined,
    localizationByteSha256,
  ).includes("extractor-hash-mismatch"),
  "localization extractor hash mutation must be rejected",
);
const tamperedAttestationBuild = structuredClone(localizationAttestation);
tamperedAttestationBuild.game.buildId = "00000000";
negative(
  validateLocalizationAttestation(
    tamperedAttestationBuild,
    localization,
    undefined,
    localizationByteSha256,
  ).includes("game-build-mismatch"),
  "localization game build mutation must be rejected",
);
const tamperedAttestationKey = structuredClone(localizationAttestation);
tamperedAttestationKey.entries[0].key = 999999999;
negative(
  validateLocalizationAttestation(
    tamperedAttestationKey,
    localization,
    undefined,
    localizationByteSha256,
  ).some(
    (error) =>
      error.startsWith("entry-registry-mismatch:") ||
      error.startsWith("las-entry-not-attested:"),
  ),
  "localization key mutation must be rejected",
);
const tamperedAttestationValue = structuredClone(localizationAttestation);
tamperedAttestationValue.entries[0].simplifiedChinese = "LAS-13 changed";
negative(
  validateLocalizationAttestation(
    tamperedAttestationValue,
    localization,
    undefined,
    localizationByteSha256,
  ).some(
    (error) =>
      error.startsWith("entry-registry-mismatch:") ||
      error.startsWith("las-entry-not-attested:"),
  ),
  "localization value mutation must be rejected",
);
const tamperedAttestationRegistry = structuredClone(localizationAttestation);
tamperedAttestationRegistry.registry.registrySha256 = "0".repeat(64);
negative(
  validateLocalizationAttestation(
    tamperedAttestationRegistry,
    localization,
    undefined,
    localizationByteSha256,
  ).some(
    (error) =>
      error === "registry-byte-hash-mismatch" ||
      error.startsWith("las-binding-mismatch:"),
  ),
  "localization registry binding mutation must be rejected",
);
const emptyLocalizationCorrectionConfig = structuredClone(correctionsConfig);
emptyLocalizationCorrectionConfig.corrections.find(
  (correction) => correction.correctionId === "siege-breakers-las-16-to-las-13",
).officialLocalizationBindings[0].entries = [];
const emptyLocalizationCorrectionIndex = buildCorrectionIndex(
  resolution,
  emptyLocalizationCorrectionConfig,
  localization,
  localizationByteSha256,
);
negative(
  emptyLocalizationCorrectionIndex.invalidCorrections.some(
    (entry) =>
      entry.correctionId === "siege-breakers-las-16-to-las-13" &&
      entry.errors?.includes("identity-conflict-official-entries-required"),
  ),
  "identity-conflict correction with empty official entries must be rejected",
);
const unrelatedLocalizationRecords = [7826706, 8334221].map((key) =>
  localization.records.find(
    (record) =>
      record.key === key &&
      record.resourcePair ===
        "0x4f68a1db55e6da09.strings.json::0x95ee90e8062250a6.strings.json",
  ),
);
const swappedLocalizationAttestation = structuredClone(localizationAttestation);
swappedLocalizationAttestation.entries = unrelatedLocalizationRecords.map(
  (record) => ({
    key: record.key,
    english: record.english,
    simplifiedChinese: record.simplifiedChinese,
  }),
);
swappedLocalizationAttestation.artifactSha256 = attestationContentHash(
  swappedLocalizationAttestation,
);
const swappedLocalizationCorrectionConfig = structuredClone(correctionsConfig);
swappedLocalizationCorrectionConfig.corrections.find(
  (correction) => correction.correctionId === "siege-breakers-las-16-to-las-13",
).officialLocalizationBindings[0].entries =
  swappedLocalizationAttestation.entries;
negative(
  validateLocalizationAttestation(
    swappedLocalizationAttestation,
    localization,
    swappedLocalizationCorrectionConfig,
    localizationByteSha256,
  ).includes("las-attestation-entry-set-mismatch"),
  "attestation and correction cannot jointly replace LAS evidence with unrelated real localization keys",
);
const swappedLocalizationCorrectionIndex = buildCorrectionIndex(
  resolution,
  swappedLocalizationCorrectionConfig,
  localization,
  localizationByteSha256,
);
negative(
  swappedLocalizationCorrectionIndex.invalidCorrections.some(
    (entry) =>
      entry.correctionId === "siege-breakers-las-16-to-las-13" &&
      entry.errors?.includes("identity-conflict-official-entry-set-mismatch"),
  ),
  "correction cannot replace the fixed LAS evidence contract with unrelated real keys",
);
const deletedManifestInput = structuredClone(sourceManifest);
deletedManifestInput.inputs.pop();
negative(
  validateSourceManifestShape(deletedManifestInput).length > 0,
  "deleted source-manifest input must fail shape validation",
);
const duplicateManifestInput = structuredClone(sourceManifest);
duplicateManifestInput.inputs.push(
  structuredClone(duplicateManifestInput.inputs[0]),
);
negative(
  validateSourceManifestShape(duplicateManifestInput).length > 0,
  "duplicate source-manifest input must fail shape validation",
);
const changedManifestPath = structuredClone(sourceManifest);
changedManifestPath.inputs.find((entry) => entry.inputId === "wiki-raw").path =
  "src/data/source/other.json";
negative(
  validateSourceManifestShape(changedManifestPath).length > 0,
  "changed source-manifest input path must fail shape validation",
);
const tamperedToolBundle = structuredClone(sourceManifest);
tamperedToolBundle.toolBundle.bundleSha256 = "0".repeat(64);
negative(
  toolBundleHash(tamperedToolBundle.toolBundle.files) !==
    tamperedToolBundle.toolBundle.bundleSha256,
  "tampered tool bundle hash must fail attestation comparison",
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      positiveCases: counts.positive,
      negativeCases: counts.negative,
      raw: {
        pages: probe.rawPageCount,
        warbondPages: probe.warbondPageCount,
        sections: probe.warbondPageSectionCount,
        candidates: probe.acquisitionProbe,
      },
      scope: {
        required: scope.expectedIds.length,
        upcoming: scope.upcomingIds.length,
        excluded: scope.excludedIds.length,
      },
      candidateDispositionCounts: Object.fromEntries(
        candidates.reduce(
          (map, candidate) =>
            map.set(
              candidate.disposition,
              (map.get(candidate.disposition) ?? 0) + 1,
            ),
          new Map(),
        ),
      ),
      fixtureCount: fixtureRun.results.length,
    },
    null,
    2,
  ),
);
