import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INPUT_PATHS,
  M1_TOOL_BUNDLE_PATHS,
  attestationContentHash,
  buildCorrectionIndex,
  buildScopeSummary,
  canonicalJson,
  expectedWarbondSets,
  readJson,
  resolveRawSnapshot,
  resolveWarbondCandidates,
  sha256,
  sourceInputSummary,
  toolBundleHash,
  validateLocalizationAttestation,
  validateSourceManifestShape,
} from "./migration-common.mjs";
import { probeRawSnapshot } from "./raw-probe.mjs";
import {
  rawTableNegativeCases,
  runRawCriticalValidation,
} from "./raw-validator.mjs";
import { runResolverFixtures } from "./resolver-gate.mjs";

const REPORT_PATH = fileURLToPath(
  new URL("../../reports/v3/migration-preflight.json", import.meta.url),
);
const SOURCE_MANIFEST_PATH = resolve(
  fileURLToPath(
    new URL("../../data/v3/config/source-manifest.json", import.meta.url),
  ),
);

async function readSource(path) {
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes) };
}

async function readOptionalSource(path) {
  try {
    return await readSource(path);
  } catch (error) {
    return {
      bytes: null,
      value: null,
      readError: String(error?.message ?? error),
    };
  }
}

function gitTracked(path) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function gitDirty(path, tracked) {
  if (!tracked) return false;
  try {
    execFileSync("git", ["diff", "--quiet", "--", path], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      stdio: "ignore",
    });
    return false;
  } catch {
    return true;
  }
}

async function auditSourceManifest() {
  const manifestBytes = await readFile(SOURCE_MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes);
  const shapeErrors = validateSourceManifestShape(manifest);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const entries = [];
  for (const expected of manifest.inputs ?? []) {
    const absolute = resolve(root, expected.path);
    try {
      const bytes = await readFile(absolute);
      const tracked = gitTracked(expected.path);
      entries.push({
        inputId: expected.inputId,
        path: expected.path,
        role: expected.role,
        required: expected.required !== false,
        exists: true,
        expectedSha256: expected.sha256,
        actualSha256: sha256(bytes),
        byteMatch: sha256(bytes) === expected.sha256,
        tracked,
        dirty: gitDirty(expected.path, tracked),
      });
    } catch (error) {
      entries.push({
        inputId: expected.inputId,
        path: expected.path,
        role: expected.role,
        required: expected.required !== false,
        exists: false,
        expectedSha256: expected.sha256,
        actualSha256: null,
        byteMatch: false,
        tracked: false,
        dirty: false,
        readError: String(error?.message ?? error),
      });
    }
  }
  const toolEntries = [];
  for (const expected of manifest.toolBundle?.files ?? []) {
    const absolute = resolve(root, expected.path);
    try {
      const bytes = await readFile(absolute);
      const actualSha256 = sha256(bytes);
      const tracked = gitTracked(expected.path);
      toolEntries.push({
        path: expected.path,
        exists: true,
        expectedSha256: expected.sha256,
        actualSha256,
        byteMatch: actualSha256 === expected.sha256,
        tracked,
        dirty: gitDirty(expected.path, tracked),
      });
    } catch (error) {
      toolEntries.push({
        path: expected.path,
        exists: false,
        expectedSha256: expected.sha256,
        actualSha256: null,
        byteMatch: false,
        tracked: false,
        dirty: false,
        readError: String(error?.message ?? error),
      });
    }
  }
  const actualToolEntries = toolEntries
    .filter((entry) => entry.exists)
    .map((entry) => ({ path: entry.path, sha256: entry.actualSha256 }));
  const actualBundleSha256 = toolBundleHash(actualToolEntries);
  const toolBundleMismatches = toolEntries.filter(
    (entry) => !entry.exists || !entry.byteMatch,
  );
  return {
    schemaVersion: manifest.schemaVersion,
    manifestPath: "data/v3/config/source-manifest.json",
    manifestFileSha256: sha256(manifestBytes),
    selfExcludedFromInputs: true,
    shapeErrors,
    entries,
    byteMismatches: entries.filter(
      (entry) => entry.required && (!entry.exists || !entry.byteMatch),
    ),
    toolBundle: {
      expectedBundleSha256: manifest.toolBundle?.bundleSha256 ?? null,
      actualBundleSha256,
      bundleMatch:
        toolBundleMismatches.length === 0 &&
        actualBundleSha256 === manifest.toolBundle?.bundleSha256,
      entries: toolEntries,
      missingOrMismatched: toolBundleMismatches,
    },
    reproducibility: manifest.reproducibility ?? null,
    warnings: [
      ...entries
        .filter((entry) => !entry.tracked || entry.dirty)
        .map((entry) => ({
          inputId: entry.inputId,
          path: entry.path,
          tracked: entry.tracked,
          dirty: entry.dirty,
          source: "input",
        })),
      ...toolEntries
        .filter((entry) => !entry.tracked || entry.dirty)
        .map((entry) => ({
          inputId: null,
          path: entry.path,
          tracked: entry.tracked,
          dirty: entry.dirty,
          source: "tool-bundle",
        })),
    ],
  };
}

function countBy(values, key) {
  return Object.fromEntries(
    values.reduce(
      (map, value) => map.set(value[key], (map.get(value[key]) ?? 0) + 1),
      new Map(),
    ),
  );
}

function productKindCounts(resolution, scopeClass) {
  return Object.fromEntries(
    resolution.equipmentRecords
      .filter((record) => record.scope.scopeClass === scopeClass)
      .reduce(
        (map, record) =>
          map.set(
            record.scope.productKind,
            (map.get(record.scope.productKind) ?? 0) + 1,
          ),
        new Map(),
      ),
  );
}

function dispositionCounts(candidates) {
  return countBy(candidates, "disposition");
}

const NON_PRODUCT_REWARD_KINDS = new Set([
  "player-card",
  "cape",
  "helmet",
  "pattern",
  "title",
  "currency",
  "emote",
  "victory-pose",
  "booster",
]);

function isNonProductCandidate(candidate) {
  if (NON_PRODUCT_REWARD_KINDS.has(candidate.rewardKind)) return true;
  return /helmet|cape|player\\s*card|pattern|emote|title|currency|booster|victory\\s*pose/iu.test(
    `${candidate.type} ${candidate.canonicalTitle} ${candidate.image ?? ""}`,
  );
}

function addReason(reasons, code, details) {
  reasons.push({ code, details });
}

function pageDispositionDigest(records) {
  return sha256(
    records
      .map((record) => ({
        pageId: record.pageId,
        revision: record.revision,
        disposition: record.disposition,
        reason: record.reason ?? null,
        stableId: record.stableId ?? null,
      }))
      .sort((left, right) => left.pageId - right.pageId),
  );
}

function candidateDigest(records) {
  return sha256(
    records
      .map((record) => ({
        candidateId: record.candidateId,
        sourcePageId: record.sourcePageId,
        sourceRevision: record.sourceRevision,
        warbondId: record.warbondId,
        page: record.page,
        canonicalTitle: record.canonicalTitle,
        type: record.type,
        rewardKind: record.rewardKind ?? null,
        itemMedals: record.itemMedals,
        disposition: record.disposition,
        reason: record.reason,
        resolutionMode: record.resolutionMode,
        canonicalId: record.canonicalId,
        typeWarning: record.typeWarning ?? null,
        sourceConflict: record.sourceConflict ?? null,
        sourceAmbiguity: record.sourceAmbiguity ?? null,
      }))
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
  );
}

function compactRawProbe(probe) {
  return {
    rawPageCount: probe.rawPageCount,
    rawSnapshotComplete: probe.rawSnapshotComplete,
    rawByteSha256: probe.rawByteSha256,
    rawPageRevisionClosure: {
      count: probe.rawPageRevisionClosure.count,
      duplicatePageIds: probe.rawPageRevisionClosure.duplicatePageIds,
      pageRevisionSetSha256: sha256(probe.rawPageRevisionClosure.pageRefs),
    },
    warbondPageCount: probe.warbondPageCount,
    warbondPageIds: probe.warbondPageIds,
    warbondPageSectionCount: probe.warbondPageSectionCount,
    acquisitionProbe: probe.acquisitionProbe,
  };
}

function sourceClosure(raw, probe) {
  const actualById = new Map(
    raw.pages.map((page) => [page.pageid, page.revid]),
  );
  const missing = probe.rawPageRevisionClosure.pageRefs.filter(
    (page) => !actualById.has(page.pageId),
  );
  const mismatched = probe.rawPageRevisionClosure.pageRefs.filter(
    (page) => actualById.get(page.pageId) !== page.revision,
  );
  return {
    missingPageIds: missing.map((page) => page.pageId),
    revisionMismatches: mismatched.map((page) => ({
      pageId: page.pageId,
      expected: page.revision,
      actual: actualById.get(page.pageId),
    })),
  };
}

export async function buildPreflightReport() {
  const [
    rawSource,
    normalizedSource,
    catalogSource,
    localizationSource,
    communitySource,
    sourceManifest,
    localizationAttestationSource,
  ] = await Promise.all([
    readSource(INPUT_PATHS.raw),
    readSource(INPUT_PATHS.normalizedDiff),
    readSource(INPUT_PATHS.catalogDiff),
    readSource(INPUT_PATHS.localizationDiff),
    readSource(INPUT_PATHS.communityDiff),
    auditSourceManifest(),
    readOptionalSource(INPUT_PATHS.localizationAttestation),
  ]);
  const raw = rawSource.value;
  const normalized = normalizedSource.value;
  const catalog = catalogSource.value;
  const resolution = resolveRawSnapshot(raw);
  const localizationByteSha256 = sha256(localizationSource.bytes);
  const localizationAttestationValidation = validateLocalizationAttestation(
    localizationAttestationSource.value,
    localizationSource.value,
    undefined,
    localizationByteSha256,
  );
  const correctionIndex = buildCorrectionIndex(
    resolution,
    undefined,
    localizationSource.value,
    localizationByteSha256,
  );
  const candidateRecords = resolveWarbondCandidates(
    raw,
    resolution,
    correctionIndex,
  );
  const scope = buildScopeSummary(resolution, catalog);
  const warbondSets = expectedWarbondSets(
    candidateRecords,
    catalog,
    resolution,
  );
  const fixtureRun = runResolverFixtures({
    raw,
    resolution,
    candidateRecords,
    catalog,
  });
  const rawValidatorRun = runRawCriticalValidation(raw, warbondSets);
  const rawTableNegativeRun = rawTableNegativeCases(raw);
  const probe = probeRawSnapshot(raw, rawSource.bytes);
  const pageDispositionCounts = countBy(resolution.pageRecords, "disposition");
  const candidateDispositionCounts = dispositionCounts(candidateRecords);
  const blockingExceptions = candidateRecords.filter(
    (candidate) =>
      ["ambiguous", "unresolved"].includes(candidate.disposition) &&
      !isNonProductCandidate(candidate),
  );
  const nonProductRejected = candidateRecords.filter(
    (candidate) =>
      candidate.disposition.startsWith("excluded") ||
      (["ambiguous", "unresolved"].includes(candidate.disposition) &&
        isNonProductCandidate(candidate)),
  );
  const nonProductAmbiguous = candidateRecords.filter(
    (candidate) => candidate.disposition === "excluded-with-source-ambiguity",
  );
  const nonProductSourceConflicts = candidateRecords.filter(
    (candidate) => candidate.disposition === "excluded-with-source-conflict",
  );
  const formalIds = new Set(scope.formalIds);
  const releasedCatalogItems = (catalog.items ?? []).filter((item) =>
    formalIds.has(item.id),
  );
  const missingPageThresholds = releasedCatalogItems
    .filter(
      (item) =>
        item.acquisition?.kind === "warbond" &&
        Number(item.acquisition.page) > 1 &&
        item.acquisition.pageUnlockMedals == null,
    )
    .map((item) => ({
      id: item.id,
      warbondId: item.acquisition.warbondId,
      page: item.acquisition.page,
      itemMedals: item.acquisition.itemMedals,
      pageUnlockMedals: item.acquisition.pageUnlockMedals ?? null,
    }));
  const legacyIncrementalMissing = releasedCatalogItems
    .filter(
      (item) =>
        item.acquisition?.kind === "warbond" &&
        item.acquisition.pageIncrementalMedals == null,
    )
    .map((item) => ({
      id: item.id,
      warbondId: item.acquisition.warbondId,
      page: item.acquisition.page,
      pageIncrementalMedals: item.acquisition.pageIncrementalMedals ?? null,
    }));
  const otherAcquisition = releasedCatalogItems
    .filter((item) => item.acquisition?.kind === "other")
    .map((item) => ({
      id: item.id,
      nameEn: item.nameEn,
      acquisition: item.acquisition,
    }));
  const dataReasons = [];
  const reproducibilityReasons = [];
  const reasons = dataReasons;
  const compactOfferComparisons = (set) => {
    const unique = (offers) =>
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
    const expected = new Map(
      set.expectedOffers.map((entry) => [
        entry.canonicalId,
        unique(entry.offers),
      ]),
    );
    const actual = new Map(
      set.actualOffers.map((entry) => [
        entry.canonicalId,
        unique(entry.offers),
      ]),
    );
    return [...new Set([...expected.keys(), ...actual.keys()])]
      .sort()
      .map((canonicalId) => ({
        canonicalId,
        expected: expected.get(canonicalId) ?? [],
        actual: actual.get(canonicalId) ?? [],
        equal:
          JSON.stringify(expected.get(canonicalId) ?? []) ===
          JSON.stringify(actual.get(canonicalId) ?? []),
      }));
  };

  if (!probe.rawSnapshotComplete)
    addReason(reasons, "raw-snapshot-incomplete", {
      rawSnapshotComplete: probe.rawSnapshotComplete,
    });
  if (probe.rawPageCount !== 467)
    addReason(reasons, "raw-page-count-mismatch", {
      expected: 467,
      actual: probe.rawPageCount,
    });
  if (probe.warbondPageCount !== 24 || probe.warbondPageSectionCount !== 79)
    addReason(reasons, "warbond-source-closure-mismatch", {
      expectedPages: 24,
      actualPages: probe.warbondPageCount,
      expectedSections: 79,
      actualSections: probe.warbondPageSectionCount,
    });
  if (
    probe.acquisitionProbe.nLink !== 545 ||
    probe.acquisitionProbe.nCost !== 545 ||
    probe.acquisitionProbe.tableRows !== 562 ||
    probe.acquisitionProbe.totalCandidates !== 1107
  )
    addReason(reasons, "raw-acquisition-probe-mismatch", {
      expected: {
        nLink: 545,
        nCost: 545,
        tableRows: 562,
        totalCandidates: 1107,
      },
      actual: probe.acquisitionProbe,
    });
  if (
    probe.rawPageRevisionClosure.duplicatePageIds.length ||
    sourceClosure(raw, probe).missingPageIds.length ||
    sourceClosure(raw, probe).revisionMismatches.length
  )
    addReason(
      reasons,
      "raw-page-revision-closure-failed",
      sourceClosure(raw, probe),
    );
  if (sourceManifest.byteMismatches.length)
    addReason(reasons, "source-manifest-byte-mismatch", {
      entries: sourceManifest.byteMismatches,
    });
  if ((pageDispositionCounts["parse-error"] ?? 0) > 0)
    addReason(reasons, "raw-parse-errors", {
      count: pageDispositionCounts["parse-error"],
      pageIds: resolution.pageRecords
        .filter((record) => record.disposition === "parse-error")
        .map((record) => record.pageId),
    });
  if (resolution.pageRecords.length !== probe.rawPageCount)
    addReason(reasons, "page-disposition-incomplete", {
      rawPages: probe.rawPageCount,
      dispositions: resolution.pageRecords.length,
    });
  if (scope.diff.missingIds.length)
    addReason(reasons, "required-scope-missing", {
      ids: scope.diff.missingIds,
    });
  if (scope.diff.extraIds.length)
    addReason(reasons, "required-scope-extra", { ids: scope.diff.extraIds });
  if (scope.unexpected.length)
    addReason(reasons, "catalog-unexpected", { details: scope.unexpected });
  if (correctionIndex.staleCorrections.length)
    addReason(reasons, "stale-corrections", {
      details: correctionIndex.staleCorrections,
    });
  if (correctionIndex.invalidCorrections.length)
    addReason(reasons, "invalid-corrections", {
      details: correctionIndex.invalidCorrections,
    });
  if (candidateRecords.length !== probe.acquisitionProbe.totalCandidates)
    addReason(reasons, "candidate-disposition-incomplete", {
      expected: probe.acquisitionProbe.totalCandidates,
      actual: candidateRecords.length,
    });
  if (candidateRecords.some((candidate) => !candidate.sourceBinding?.sourceId))
    addReason(reasons, "candidate-source-binding-missing", {
      candidateIds: candidateRecords
        .filter((candidate) => !candidate.sourceBinding?.sourceId)
        .map((candidate) => candidate.candidateId),
    });
  if (blockingExceptions.length)
    addReason(reasons, "blocking-contents-exceptions", {
      count: blockingExceptions.length,
      candidateIds: blockingExceptions.map(
        (candidate) => candidate.candidateId,
      ),
    });
  const mismatchedReleasedBonds = warbondSets
    .filter((set) => set.released && !set.exactSet)
    .map((set) => ({
      warbondId: set.warbondId,
      missingIds: set.missingIds,
      extraIds: set.extraIds,
      rawOfferConflicts: set.rawOfferConflicts,
      offerMismatches: set.offerMismatches,
    }));
  if (mismatchedReleasedBonds.length)
    addReason(reasons, "released-warbond-exact-set-mismatch", {
      bonds: mismatchedReleasedBonds,
    });
  const offerMismatchBonds = warbondSets
    .filter((set) => set.released && set.offerMismatches.length)
    .map((set) => ({
      warbondId: set.warbondId,
      offerMismatches: set.offerMismatches,
    }));
  if (offerMismatchBonds.length)
    addReason(reasons, "released-warbond-offer-mismatch", {
      bonds: offerMismatchBonds,
    });
  const rawOfferConflictBonds = warbondSets
    .filter((set) => set.released && set.rawOfferConflicts.length)
    .map((set) => ({
      warbondId: set.warbondId,
      rawOfferConflicts: set.rawOfferConflicts,
    }));
  if (rawOfferConflictBonds.length)
    addReason(reasons, "raw-warbond-offer-conflict", {
      bonds: rawOfferConflictBonds,
    });
  if (!fixtureRun.passed)
    addReason(reasons, "resolver-fixtures-failed", {
      fixtureIds: fixtureRun.failedFixtureIds,
    });
  if (!rawValidatorRun.passed)
    addReason(reasons, "independent-raw-validator-failed", {
      productionDiff: rawValidatorRun.productionDiff,
    });
  if (missingPageThresholds.length)
    addReason(reasons, "missing-released-page-thresholds", {
      count: missingPageThresholds.length,
      items: missingPageThresholds,
    });
  if (otherAcquisition.length)
    addReason(reasons, "released-acquisition-other", {
      count: otherAcquisition.length,
      items: otherAcquisition,
    });
  if (localizationAttestationValidation.length)
    addReason(dataReasons, "localization-attestation-invalid", {
      errors: localizationAttestationValidation,
      readError: localizationAttestationSource.readError ?? null,
    });
  if (sourceManifest.shapeErrors.length) {
    addReason(dataReasons, "source-manifest-shape-invalid", {
      errors: sourceManifest.shapeErrors,
    });
    addReason(reproducibilityReasons, "source-manifest-shape-invalid", {
      errors: sourceManifest.shapeErrors,
    });
  }
  if (
    sourceManifest.toolBundle.missingOrMismatched.length ||
    !sourceManifest.toolBundle.bundleMatch
  ) {
    addReason(reproducibilityReasons, "tool-bundle-mismatch", {
      bundle: sourceManifest.toolBundle,
    });
  }
  if (sourceManifest.warnings.length)
    addReason(reproducibilityReasons, "uncommitted-inputs-not-reproducible", {
      warnings: sourceManifest.warnings,
    });

  const reportWithoutHash = {
    schemaVersion: "migration-preflight.v1",
    toolVersion: "m1-migration.v1",
    inputs: sourceInputSummary(
      raw,
      normalized,
      catalog,
      localizationSource.value,
      communitySource.value,
      sha256(rawSource.bytes),
      {
        normalized: sha256(normalizedSource.bytes),
        catalog: sha256(catalogSource.bytes),
        officialLocalization: sha256(localizationSource.bytes),
        communityAliases: sha256(communitySource.bytes),
      },
    ),
    rawProbe: compactRawProbe(probe),
    sourcePolicy: {
      rawFactSources: ["wiki-raw.json", "community original text"],
      diffOnlyInputs: [
        "wiki-normalized.json",
        "catalog.json",
        "xiaoheihe-community-aliases.json",
      ],
      correctionEvidenceOnly: {
        path: "src/data/source/official-localization.json",
        role: "correction-evidence-only sealed derived snapshot",
        byteSha256: localizationByteSha256,
        originalStringsInRepo: false,
        attestationPath: "data/v3/config/localization-attestation.json",
        attestationContentSha256: localizationAttestationSource.value
          ? attestationContentHash(localizationAttestationSource.value)
          : null,
      },
      diffOnlyRule:
        "Diff-only inputs are never accepted as RawFact evidence in M1; official-localization is not diff-only and is used only to validate typed corrections.",
    },
    sourceManifest,
    localizationAttestation: {
      path: "data/v3/config/localization-attestation.json",
      present: Boolean(localizationAttestationSource.value),
      artifactSha256:
        localizationAttestationSource.value?.artifactSha256 ?? null,
      recomputedContentSha256: localizationAttestationSource.value
        ? attestationContentHash(localizationAttestationSource.value)
        : null,
      validationErrors: localizationAttestationValidation,
      readError: localizationAttestationSource.readError ?? null,
    },
    rawPageDisposition: {
      counts: pageDispositionCounts,
      recordCount: resolution.pageRecords.length,
      recordSetSha256: pageDispositionDigest(resolution.pageRecords),
      parseErrorRecords: resolution.pageRecords.filter(
        (record) => record.disposition === "parse-error",
      ),
    },
    normalizedReference: {
      itemCount: normalized.items?.length ?? 0,
      role: "reference-diff-only",
    },
    scope: {
      normalizedEquipmentCount: resolution.equipmentRecords.length,
      requiredCount: scope.expectedIds.length,
      formalCatalogCount: scope.formalIds.length,
      requiredIdSetSha256: sha256(scope.expectedIds),
      formalCatalogIdSetSha256: sha256(scope.formalIds),
      upcomingIds: scope.upcomingIds,
      excludedIds: scope.excludedIds,
      symmetricDiff: scope.diff,
      catalogUnexpected: scope.unexpected,
      upcomingRecords: resolution.equipmentRecords
        .filter((record) => record.scope.scopeClass === "upcoming")
        .map((record) => ({
          id: record.item.id,
          title: record.page.title,
          productKind: record.scope.productKind,
          availableFrom: record.scope.availableFrom,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      excludedRecords: resolution.equipmentRecords
        .filter((record) => record.scope.scopeClass === "out-of-product-scope")
        .map((record) => ({
          id: record.item.id,
          title: record.page.title,
          category: record.item.category,
          slot: record.item.slot,
          productKind: record.scope.productKind,
          reason: record.scope.reason,
          ruleId: record.scope.ruleId,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      productKindCounts: {
        required: productKindCounts(resolution, "required"),
        upcoming: productKindCounts(resolution, "upcoming"),
        excluded: productKindCounts(resolution, "out-of-product-scope"),
      },
      groups: scope.groups,
    },
    warbond: {
      sourcePageCount: probe.warbondPageCount,
      sourceSectionCount: probe.warbondPageSectionCount,
      candidateCounts: {
        ...probe.acquisitionProbe,
        dispositioned: candidateRecords.length,
        exceptionCount: blockingExceptions.length,
      },
      dispositionCounts: candidateDispositionCounts,
      candidateAudit: {
        blockingExceptions,
        blockingExceptionCount: blockingExceptions.length,
        blockingProductExceptionCount: blockingExceptions.length,
        nonProductRejectedCount: nonProductRejected.length,
        nonProductRejectedByReason: countBy(nonProductRejected, "reason"),
        nonProductRejectedIdSetSha256: sha256(
          nonProductRejected.map((candidate) => candidate.candidateId).sort(),
        ),
        nonProductRejectedSample: nonProductRejected
          .map((candidate) => candidate.candidateId)
          .sort()
          .slice(0, 20),
        nonProductAmbiguous,
        nonProductAmbiguousCount: nonProductAmbiguous.length,
        nonProductSourceConflicts,
        nonProductSourceConflictCount: nonProductSourceConflicts.length,
      },
      candidateSetSha256: candidateDigest(candidateRecords),
      typeWarningCount: candidateRecords.filter(
        (candidate) => candidate.typeWarning,
      ).length,
      typeWarnings: candidateRecords
        .filter((candidate) => candidate.typeWarning)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          canonicalTitle: candidate.canonicalTitle,
          type: candidate.type,
          canonicalId: candidate.canonicalId,
          warning: candidate.typeWarning,
        })),
      exceptions: candidateRecords.filter((candidate) =>
        ["ambiguous", "unresolved"].includes(candidate.disposition),
      ),
      sets: warbondSets.map((set) => ({
        warbondId: set.warbondId,
        released: set.released,
        upcomingIds: set.upcomingIds,
        expectedCount: set.expectedIds.length,
        formalCount: set.formalIds.length,
        missingIds: set.missingIds,
        extraIds: set.extraIds,
        rawOfferConflicts: set.rawOfferConflicts,
        offerMismatches: set.offerMismatches,
        offerDiffCount: set.offerDiffCount,
        offerComparisons: set.released ? compactOfferComparisons(set) : [],
        exactSet: set.exactSet,
      })),
    },
    corrections: {
      applied: correctionIndex.correctionsApplied,
      stale: correctionIndex.staleCorrections,
      invalid: correctionIndex.invalidCorrections,
    },
    acquisitionAudit: {
      releasedCatalogCount: releasedCatalogItems.length,
      missingPageThresholds,
      missingPageThresholdCount: missingPageThresholds.length,
      legacyIncrementalReference: {
        field: "pageIncrementalMedals",
        role: "legacy-reference-only",
        missingCount: legacyIncrementalMissing.length,
        denominator: releasedCatalogItems.filter(
          (item) => item.acquisition?.kind === "warbond",
        ).length,
        idSetSha256: sha256(
          legacyIncrementalMissing.map((item) => item.id).sort(),
        ),
        sampleIds: legacyIncrementalMissing
          .map((item) => item.id)
          .sort()
          .slice(0, 20),
      },
      otherAcquisition,
      otherAcquisitionCount: otherAcquisition.length,
    },
    resolverFixtures: {
      production: fixtureRun,
      independentRaw: rawValidatorRun,
      rawTable: rawTableNegativeRun,
    },
    gate: {
      status:
        dataReasons.length === 0 && reproducibilityReasons.length === 0
          ? "unblocked"
          : "blocked",
      blocked: dataReasons.length > 0 || reproducibilityReasons.length > 0,
      dataReady: dataReasons.length === 0,
      reproducibleReady:
        dataReasons.length === 0 && reproducibilityReasons.length === 0,
      blockedReasons: [...dataReasons, ...reproducibilityReasons],
      dataBlockedReasons: dataReasons,
      reproducibilityBlockedReasons: reproducibilityReasons,
    },
  };
  const auditHash = sha256(reportWithoutHash);
  return { ...reportWithoutHash, auditHash };
}

if (process.argv[1]) {
  const report = await buildPreflightReport();
  await mkdir(resolve(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        report: "reports/v3/migration-preflight.json",
        auditHash: report.auditHash,
        status: report.gate.status,
        blockedReasons: report.gate.blockedReasons.map((reason) => reason.code),
      },
      null,
      2,
    ),
  );
}
