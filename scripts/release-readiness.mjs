import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PRODUCT_SCOPE_MANIFEST,
  catalogUnexpectedPass,
  classifyFormalCatalogUnexpectedIds,
  classifyProductScope,
} from "./lib/product-scope.mjs";

const root = resolve(import.meta.dirname, "..");
const load = async (relativePath) =>
  JSON.parse(await readFile(resolve(root, relativePath), "utf8"));

const catalog = await load("src/data/catalog.json");
const runtimeCatalog = await load("src/data/catalog-runtime.json");
const manifest = await load("src/data/assets/manifest.json");
const normalized = await load("src/data/source/wiki-normalized.json");
const rawSnapshot = await load("src/data/source/wiki-raw.json");
const community = await load(
  "src/data/source/xiaoheihe-community-aliases.json",
);
const translationEvidence = await load(
  "src/data/source/translation-evidence.json",
);
const goldenFixtures = await load(
  "src/data/source/release-golden-fixtures.json",
);
const productScopeCoverage = await load("reports/product-scope-coverage.json");
const pageDisposition = await load("reports/wiki-page-disposition.json");

const items = Array.isArray(catalog.items) ? catalog.items : [];
const quarantine = Array.isArray(catalog.quarantine) ? catalog.quarantine : [];
const all = [...items, ...quarantine];
const manifestByPath = new Map(
  (manifest.assets ?? []).map((asset) => [asset.path, asset]),
);
const formalIds = new Set(items.map((item) => item.id));
const runtimeItems = Array.isArray(runtimeCatalog.items)
  ? runtimeCatalog.items
  : [];
const runtimeById = new Map(runtimeItems.map((item) => [item.id, item]));
const normalizedById = new Map(
  (normalized.items ?? []).map((item) => [item.id, item]),
);
const normalizedScopeById = new Map(
  [...normalizedById.values()].map((item) => [
    item.id,
    classifyProductScope(item),
  ]),
);
const productScopeIds = new Set(
  [...normalizedScopeById.entries()]
    .filter(([, scope]) => scope.scopeClass === "required")
    .map(([id]) => id),
);
const expectedReleasedIds = [...normalizedScopeById.entries()]
  .filter(([, scope]) => scope.scopeClass === "required")
  .map(([id]) => id)
  .sort();
const formalCatalogIds = [...formalIds].sort();
const catalogUnexpectedDetails = classifyFormalCatalogUnexpectedIds(
  formalCatalogIds,
  expectedReleasedIds,
  normalizedScopeById,
);
const catalogUnexpectedCount = catalogUnexpectedDetails.length;
const catalogNoUnexpected = catalogUnexpectedPass(catalogUnexpectedDetails);
const sourceRecords = translationEvidence.records ?? [];
const readinessDate = new Date().toISOString().slice(0, 10);

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");

const addIndex = (index, key, value) => {
  if (!key) return;
  const values = index.get(key) ?? new Set();
  values.add(value);
  index.set(key, values);
};

const exactFormalAliasIndex = new Map();
for (const item of items) {
  for (const alias of item.aliases ?? [])
    addIndex(exactFormalAliasIndex, normalize(alias.text), item.id);
}

const canonicalIdFor = (sourceId) =>
  sourceRecords.find(
    (record) =>
      record.canonicalId === sourceId ||
      record.legacyCommunityIds?.includes(sourceId),
  )?.canonicalId ?? sourceId;

const equipmentAliasResults = [];
for (const sourceItem of community.equipment ?? []) {
  for (const alias of sourceItem.aliases ?? []) {
    const expectedId = canonicalIdFor(sourceItem.id);
    const matches = [...(exactFormalAliasIndex.get(normalize(alias)) ?? [])];
    equipmentAliasResults.push({
      alias,
      sourceId: sourceItem.id,
      expectedId,
      matches,
      ok: matches.length === 1 && matches[0] === expectedId,
    });
  }
}

const exactGlossaryAliasIndex = new Map();
for (const term of catalog.glossaryTerms ?? [])
  for (const alias of term.aliases ?? [])
    addIndex(exactGlossaryAliasIndex, normalize(alias), term.id);
const glossaryAliasResults = [];
for (const term of community.glossaryTerms ?? []) {
  for (const alias of term.aliases ?? []) {
    const matches = [...(exactGlossaryAliasIndex.get(normalize(alias)) ?? [])];
    glossaryAliasResults.push({
      alias,
      sourceId: term.id,
      matches,
      ok: matches.length === 1 && matches[0] === term.id,
    });
  }
}

const warbondsById = new Map(
  (catalog.warbonds ?? []).map((warbond) => [warbond.id, warbond]),
);
const acquisitionComplete = (item) => {
  const acquisition = item.acquisition;
  if (!acquisition || typeof acquisition !== "object") return false;
  switch (acquisition.kind) {
    case "warbond":
      return (
        Boolean(warbondsById.get(acquisition.warbondId)?.nameZh?.trim()) &&
        Number.isInteger(acquisition.page) &&
        acquisition.page > 0 &&
        Number.isInteger(acquisition.itemMedals) &&
        Number.isInteger(acquisition.pageUnlockMedals)
      );
    case "requisition":
      return Number.isInteger(acquisition.requisitionPoints);
    case "default":
      return true;
    case "superstore":
      return (
        Number.isInteger(acquisition.superCredits) &&
        acquisition.status !== "pending"
      );
    case "edition":
      return Boolean(
        acquisition.editionName &&
        acquisition.status !== "pending" &&
        (acquisition.status === "unavailable" ||
          acquisition.price === null ||
          Number.isInteger(acquisition.price)),
      );
    case "event":
      return Boolean(acquisition.eventName && acquisition.status !== "pending");
    case "poi":
      return Boolean(acquisition.location && acquisition.status !== "pending");
    case "unavailable":
      return Boolean(acquisition.reason);
    case "other":
      return Boolean(acquisition.label && acquisition.status !== "pending");
    default:
      return false;
  }
};

const translationComplete = (item) => {
  if (!item.nameZh || !Array.isArray(item.translationEvidence)) return false;
  if (item.translationEvidence.some((entry) => entry.status === "official"))
    return true;
  const independent = new Set(
    item.translationEvidence
      .filter((entry) => entry.status === "verified-community")
      .flatMap((entry) =>
        (entry.evidenceRefs ?? []).map(
          (ref) => ref.url ?? `${ref.kind}:${ref.label}`,
        ),
      ),
  );
  return independent.size >= 2;
};

const attackComplete = (item) => {
  if (!["weapon", "grenade"].includes(item.category)) return true;
  return Boolean(
    item.attackProfile?.components?.some(
      (component) =>
        component.fields &&
        (component.fields.standardDamage !== undefined ||
          component.fields.armorPenetration !== undefined),
    ),
  );
};

const realImage = (item) =>
  Boolean(
    item.image?.status === "verified" &&
    item.image?.provenanceStatus === "verified" &&
    ["open-license", "documented-copyrighted"].includes(
      item.image?.rightsStatus,
    ) &&
    item.image?.fileHash &&
    item.image?.filePage &&
    item.image?.originalUrl &&
    item.image?.licenseRaw &&
    item.image?.sourceRefs?.some((ref) => ref.revision),
  );

const cleanWikiUrl = (value) => {
  if (typeof value !== "string") return null;
  if (!/^https:\/\/helldivers\.wiki\.gg(?=\/|$)/u.test(value)) return null;
  if (/^https:\/\/[^/]*:\d+(?:\/|$)/u.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "helldivers.wiki.gg" ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !parsed.pathname.startsWith("/wiki/") ||
      parsed.pathname === "/wiki/"
    )
      return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return null;
  }
};
const wikiUrlResults = items.map((item) => {
  const runtimeItem = runtimeById.get(item.id);
  const auditUrl = cleanWikiUrl(item.wikiUrl);
  const runtimeUrl = cleanWikiUrl(runtimeItem?.wikiUrl);
  const sourceMatch = (item.sourceRefs ?? []).some((ref) => {
    const sourceUrl = cleanWikiUrl(ref.url);
    return (
      ref.kind === "wiki" &&
      sourceUrl === auditUrl &&
      Number.isInteger(ref.pageId) &&
      (ref.revision !== undefined || ref.oldid !== undefined)
    );
  });
  return {
    id: item.id,
    auditUrl,
    runtimeUrl,
    checks: {
      auditUrl: Boolean(auditUrl),
      sourceMatch,
      runtimeProjection: Boolean(runtimeItem) && runtimeUrl === auditUrl,
    },
  };
});
const wikiUrls = wikiUrlResults
  .map((result) => result.auditUrl)
  .filter(Boolean);
const wikiUrlCounts = new Map(
  wikiUrls.map((url) => [
    url,
    wikiUrls.filter((candidate) => candidate === url).length,
  ]),
);
const wikiUrlCoverage = items.length
  ? wikiUrlResults.filter(
      (result) => result.checks.auditUrl && result.checks.sourceMatch,
    ).length / items.length
  : 0;
const wikiUrlGlobalUnique =
  wikiUrls.length === items.length && new Set(wikiUrls).size === items.length;
const wikiUrlRuntimeProjection = wikiUrlResults.every(
  (result) => result.checks.runtimeProjection,
);
const runtimeHasNoSourceRefs =
  !JSON.stringify(runtimeCatalog).includes('"sourceRefs"');
const warbondContentsCoverage = catalog.coverage?.warbondContentsCoverage ?? [];
const upcomingIds = new Set(productScopeCoverage.upcomingIds ?? []);
const upcomingNotDueIds = new Set(upcomingIds);
const warbondContentsPass =
  warbondContentsCoverage.length === (normalized.warbonds ?? []).length &&
  warbondContentsCoverage.length > 0 &&
  warbondContentsCoverage.every(
    (entry) =>
      entry.parity === true ||
      (entry.missingFromAdmitted?.length > 0 &&
        entry.missingFromAdmitted.every((id) => upcomingNotDueIds.has(id))),
  );
const warbondContentsAmbiguityCount = warbondContentsCoverage.reduce(
  (sum, entry) => sum + (entry.ambiguityCount ?? 0),
  0,
);
const warbondContentsFallbackCount = warbondContentsCoverage.reduce(
  (sum, entry) => sum + (entry.fallbackCount ?? 0),
  0,
);

// The Vitest golden tests exercise searchEquipment directly. Keep the release
// report honest too: formal admission alone is not enough unless the generated
// search projection returns exactly one formal ID for each published name and
// model query.
const exactSearchIds = (query) => {
  const normalizedQuery = normalize(query);
  return items
    .filter((item) => {
      const search = item.search ?? {};
      const candidates = [
        search.model,
        search.formalName,
        search.modelFormalName,
        search.englishName,
        ...(search.aliases ?? []),
      ];
      return candidates.some(
        (candidate) => normalize(candidate) === normalizedQuery,
      );
    })
    .map((item) => item.id);
};

const goldenFixtureResults = (goldenFixtures.warbonds ?? []).flatMap(
  (fixtureWarbond) => {
    const warbond = warbondsById.get(fixtureWarbond.id);
    return fixtureWarbond.items.map((fixture) => {
      const item = items.find((candidate) => candidate.id === fixture.id);
      const acquisition = item?.acquisition;
      const pageThreshold = warbond?.pageThresholds?.find(
        (candidate) => candidate.page === fixture.page,
      );
      const expectedImageOk =
        fixture.imageStatus === "placeholder"
          ? item?.image?.status === "placeholder" &&
            item.image.path === "assets/placeholder-equipment.svg"
          : realImage(item);
      const nameSearchIds = exactSearchIds(fixture.nameZh);
      const modelSearchIds = exactSearchIds(fixture.model);
      const checks = {
        formallySearchable: formalIds.has(fixture.id),
        nameSearch:
          nameSearchIds.length === 1 && nameSearchIds[0] === fixture.id,
        modelSearch:
          modelSearchIds.length === 1 && modelSearchIds[0] === fixture.id,
        warbondNameZh: warbond?.nameZh === fixtureWarbond.nameZh,
        nameZh: item?.nameZh === fixture.nameZh,
        model: item?.model === fixture.model,
        warbondId:
          acquisition?.kind === "warbond" &&
          acquisition.warbondId === fixtureWarbond.id,
        page: acquisition?.page === fixture.page,
        itemMedals: acquisition?.itemMedals === fixture.itemMedals,
        incrementalMedals:
          acquisition?.pageIncrementalMedals === fixture.incrementalMedals,
        cumulativeMedals:
          acquisition?.pageUnlockMedals === fixture.cumulativeMedals,
        warbondPageThreshold:
          pageThreshold?.incrementalMedals === fixture.incrementalMedals &&
          pageThreshold?.cumulativeMedals === fixture.cumulativeMedals,
        thresholdSources:
          (pageThreshold?.sourceRefs?.length ?? 0) >= 2 &&
          pageThreshold.sourceRefs.every((ref) => Boolean(ref.url)),
        imageStatus: expectedImageOk,
      };
      return {
        warbondId: fixtureWarbond.id,
        itemId: fixture.id,
        ok: Object.values(checks).every(Boolean),
        checks,
        search: {
          nameZh: { query: fixture.nameZh, ids: nameSearchIds },
          model: { query: fixture.model, ids: modelSearchIds },
        },
      };
    });
  },
);
const goldenFixtureFailures = goldenFixtureResults.filter(
  (result) => !result.ok,
);
const goldenFixtureShapeOk =
  goldenFixtures.warbonds?.length === 2 &&
  goldenFixtures.warbonds.every((warbond) => warbond.items?.length === 7);

const countBy = (records, field) =>
  records.reduce((counts, record) => {
    const key = record[field] ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

const categoryCounts = countBy(items, "category");
const quarantineCategoryCounts = countBy(quarantine, "category");
const normalizedCategoryCounts = normalized.items.reduce((counts, item) => {
  counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
}, {});
const requiredCategories = ["weapon", "grenade", "stratagem", "armor"];
const requiredWeaponSlots = ["primary", "secondary", "support"];
const categoryAudit = Object.fromEntries(
  requiredCategories.map((category) => [
    category,
    {
      normalized: normalizedCategoryCounts[category] ?? 0,
      admitted: categoryCounts[category] ?? 0,
      quarantined: quarantineCategoryCounts[category] ?? 0,
      hasFormalItems: (categoryCounts[category] ?? 0) > 0,
    },
  ]),
);
const weaponSlotAudit = Object.fromEntries(
  requiredWeaponSlots.map((slot) => [
    slot,
    items.filter((item) => item.category === "weapon" && item.slot === slot)
      .length,
  ]),
);

const rawPages = Array.isArray(rawSnapshot.pages) ? rawSnapshot.pages : [];
const categoryStatus = normalized.categoryStatus ?? [];
const categoryStatusComplete = categoryStatus.every(
  (entry) =>
    entry.ok === true && Number.isInteger(entry.count) && entry.count > 0,
);
const normalizedAccountingComplete =
  normalized.coverage?.total === normalized.items.length &&
  normalized.items.length ===
    Object.values(normalizedCategoryCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
const frozenScopeComplete =
  normalized.coverage?.rawSnapshotComplete === true &&
  normalized.coverage?.rawPages === rawPages.length &&
  normalized.coverage?.rawPages === normalized.discoveredPages.length &&
  categoryStatusComplete &&
  normalizedAccountingComplete;

const catalogById = new Map(all.map((item) => [item.id, item]));
const normalizedButNotSearchable = normalized.items
  .filter((item) => productScopeIds.has(item.id))
  .filter((item) => !formalIds.has(item.id))
  .map((item) => {
    const generated = catalogById.get(item.id);
    return {
      id: item.id,
      title: item.canonicalTitle,
      category: item.category,
      reason: generated?.quarantineReason ?? "not present in generated catalog",
      acquisitionKind: generated?.acquisition?.kind ?? null,
    };
  });
const unaccountedNormalized = normalizedButNotSearchable.filter(
  (item) => !item.reason,
);
const upcomingRule = PRODUCT_SCOPE_MANIFEST.exclusions.find(
  (rule) => rule.ruleId === "upcoming-castellans-creed",
);
const scopeResults = [...normalizedById.values()].map((item) => {
  const scope = normalizedScopeById.get(item.id);
  const upcoming = scope?.scopeClass === "upcoming";
  const upcomingOverdue =
    upcoming && typeof upcomingRule?.availableFrom === "string"
      ? readinessDate >= upcomingRule.availableFrom
      : false;
  return {
    id: item.id,
    scopeClass: scope?.scopeClass ?? "unknown",
    ruleId: scope?.ruleId ?? null,
    admissionStatus: catalogById.get(item.id)?.admissionStatus ?? null,
    exclusionCode: scope?.reason ?? null,
    availableFrom: upcomingRule?.availableFrom ?? null,
    overdue: upcomingOverdue,
    ok:
      scope?.scopeClass === "required"
        ? formalIds.has(item.id)
        : scope?.scopeClass === "upcoming"
          ? !upcomingOverdue
          : scope?.scopeClass === "out-of-product-scope",
  };
});
const scopeManifestComplete =
  PRODUCT_SCOPE_MANIFEST.schemaVersion === "product-scope.v2" &&
  productScopeCoverage.invariants?.rawPageDispositionComplete === true &&
  productScopeCoverage.invariants?.normalizedItemsExactlyOneScopeRule ===
    true &&
  productScopeCoverage.invariants?.normalizedStableIdsUnique === true &&
  pageDisposition.invariants?.everyRawPageHasDisposition === true &&
  pageDisposition.pages?.length === rawPages.length;
const requiredScopeResults = scopeResults.filter(
  (entry) => entry.scopeClass === "required",
);
const excludedScopeResults = scopeResults.filter(
  (entry) => entry.scopeClass === "out-of-product-scope",
);
const requiredScopePass =
  requiredScopeResults.length > 0 &&
  requiredScopeResults.every((entry) => entry.ok);
const excludedScopePass = excludedScopeResults.every((entry) => entry.ok);
const upcomingScopeResults = scopeResults.filter(
  (entry) => entry.scopeClass === "upcoming",
);
const upcomingScopePass = upcomingScopeResults.every((entry) => entry.ok);
const scopeUnknownCount = scopeResults.filter(
  (entry) =>
    !["required", "upcoming", "out-of-product-scope"].includes(
      entry.scopeClass,
    ),
).length;

const demolitionValues = items.flatMap((item) =>
  (item.attackProfile?.components ?? [])
    .filter((component) => component.fields?.demolitionForce !== undefined)
    .map((component) => ({
      itemId: item.id,
      value: component.fields.demolitionForce,
    })),
);

const metrics = {
  generatedAt: new Date().toISOString(),
  formalItemCount: items.length,
  quarantineCount: quarantine.length,
  categoryCounts,
  quarantineCategoryCounts,
  normalizedCategoryCounts,
  productScope: productScopeCoverage,
  categoryAudit,
  weaponSlotAudit,
  rawSnapshotComplete: frozenScopeComplete ? 1 : 0,
  frozenScopeComplete: frozenScopeComplete ? 1 : 0,
  normalizedAccountingComplete: normalizedAccountingComplete ? 1 : 0,
  normalizedItemCount: normalized.items.length,
  normalizedButNotSearchableCount: normalizedButNotSearchable.length,
  normalizedButNotSearchableExplained:
    unaccountedNormalized.length === 0 ? 1 : 0,
  normalizedButNotSearchable,
  scopeManifestComplete: scopeManifestComplete ? 1 : 0,
  parseErrorFree:
    (pageDisposition.dispositionCounts?.["parse-error"] ?? 0) === 0 ? 1 : 0,
  catalogUnexpectedCount,
  catalogNoUnexpected: catalogNoUnexpected ? 1 : 0,
  catalogUpcomingLeakedCount: catalogUnexpectedDetails.filter(
    (entry) => entry.classification === "upcoming-leaked",
  ).length,
  catalogOutOfScopeLeakedCount: catalogUnexpectedDetails.filter(
    (entry) => entry.classification === "out-of-scope-leaked",
  ).length,
  catalogUnknownLeakedCount: catalogUnexpectedDetails.filter(
    (entry) => entry.classification === "unknown",
  ).length,
  catalogUnexpectedDetails,
  scopeManifestMissingCount: 0,
  scopeManifestMissingIds: [],
  scopeRequiredTotal: requiredScopeResults.length,
  scopeRequiredAdmitted: requiredScopeResults.filter((entry) => entry.ok)
    .length,
  requiredScopePass: requiredScopePass ? 1 : 0,
  scopeExcludedTotal: excludedScopeResults.length,
  scopeExcludedAccepted: excludedScopeResults.filter((entry) => entry.ok)
    .length,
  excludedScopePass: excludedScopePass ? 1 : 0,
  upcomingScopeTotal: upcomingScopeResults.length,
  upcomingScopePass: upcomingScopePass ? 1 : 0,
  upcomingScopeOverdue: upcomingScopeResults.filter((entry) => entry.overdue)
    .length,
  scopeUnknownCount,
  scopeResults,
  translationEvidenceCoverage: items.length
    ? items.filter(translationComplete).length / items.length
    : 0,
  acquisitionCompleteness: items.length
    ? items.filter(acquisitionComplete).length / items.length
    : 0,
  imageCoverage: items.length
    ? items.filter(realImage).length / items.length
    : 0,
  wikiUrlCoverage,
  wikiUrlGlobalUnique: wikiUrlGlobalUnique ? 1 : 0,
  wikiUrlDuplicateValues: [...wikiUrlCounts]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count })),
  wikiUrlRuntimeProjection: wikiUrlRuntimeProjection ? 1 : 0,
  runtimeHasNoSourceRefs: runtimeHasNoSourceRefs ? 1 : 0,
  warbondContentsPass: warbondContentsPass ? 1 : 0,
  warbondContentsAmbiguityFree: warbondContentsAmbiguityCount === 0 ? 1 : 0,
  warbondContentsFallbackFree: warbondContentsFallbackCount === 0 ? 1 : 0,
  warbondContentsAmbiguityCount,
  warbondContentsFallbackCount,
  warbondContentsCoverage,
  wikiUrlResults,
  attackParameterCoverage: items.filter((item) =>
    ["weapon", "grenade"].includes(item.category),
  ).length
    ? items.filter(
        (item) =>
          ["weapon", "grenade"].includes(item.category) && attackComplete(item),
      ).length /
      items.filter((item) => ["weapon", "grenade"].includes(item.category))
        .length
    : 1,
  weaponTypeCoverage: items.filter((item) => item.category === "weapon").length
    ? items.filter(
        (item) =>
          item.category === "weapon" &&
          item.weaponProfile?.weaponType?.verificationStatus === "verified",
      ).length / items.filter((item) => item.category === "weapon").length
    : 0,
  requiredCategoryCoverage:
    requiredCategories.filter(
      (category) => categoryAudit[category].hasFormalItems,
    ).length / requiredCategories.length,
  weaponSlotCoverage:
    requiredWeaponSlots.filter((slot) => weaponSlotAudit[slot] > 0).length /
    requiredWeaponSlots.length,
  demolitionValuesSourced: demolitionValues.length,
  demolitionValueItems: demolitionValues,
  goldenFixtureTotal: goldenFixtureResults.length,
  goldenFixturePassed: goldenFixtureResults.filter((result) => result.ok)
    .length,
  goldenFixtureSearchPassed: goldenFixtureResults.filter(
    (result) => result.checks.nameSearch && result.checks.modelSearch,
  ).length,
  goldenFixtureSearchPass:
    goldenFixtureResults.length === 14 &&
    goldenFixtureResults.every(
      (result) => result.checks.nameSearch && result.checks.modelSearch,
    )
      ? 1
      : 0,
  goldenFixturePass:
    goldenFixtureShapeOk &&
    goldenFixtureResults.length === 14 &&
    goldenFixtureFailures.length === 0
      ? 1
      : 0,
  goldenFixtureResults,
  goldenFixtureFailures,
  communityEquipmentAliasTotal: equipmentAliasResults.length,
  communityEquipmentAliasFormalUnique: equipmentAliasResults.filter(
    (result) => result.ok,
  ).length,
  communityEquipmentAliasFailures: equipmentAliasResults.filter(
    (result) => !result.ok,
  ),
  communityGlossaryAliasTotal: glossaryAliasResults.length,
  communityGlossaryAliasFormalUnique: glossaryAliasResults.filter(
    (result) => result.ok,
  ).length,
  communityGlossaryAliasFailures: glossaryAliasResults.filter(
    (result) => !result.ok,
  ),
  currencyIconCoverage: (catalog.currencies ?? []).length
    ? (catalog.currencies ?? []).filter((entry) => {
        const asset = manifestByPath.get(entry.iconAssetPath);
        return (
          asset?.status === "verified" &&
          asset.licenseStatus === "documented" &&
          asset.provenanceStatus === "verified" &&
          ["open-license", "documented-copyrighted"].includes(
            asset.rightsStatus,
          ) &&
          asset.licenseRaw &&
          asset.filePage &&
          asset.originalUrl &&
          asset.fileHash
        );
      }).length / catalog.currencies.length
    : 0,
};

const thresholds = {
  rawSnapshotComplete: 1,
  frozenScopeComplete: 1,
  normalizedAccountingComplete: 1,
  normalizedButNotSearchableExplained: 1,
  scopeManifestComplete: 1,
  parseErrorFree: 1,
  catalogNoUnexpected: 1,
  requiredScopePass: 1,
  excludedScopePass: 1,
  upcomingScopePass: 1,
  translationEvidenceCoverage: 1,
  acquisitionCompleteness: 1,
  imageCoverage: 0.8,
  wikiUrlCoverage: 1,
  wikiUrlGlobalUnique: 1,
  wikiUrlRuntimeProjection: 1,
  runtimeHasNoSourceRefs: 1,
  warbondContentsPass: 1,
  warbondContentsAmbiguityFree: 1,
  warbondContentsFallbackFree: 1,
  attackParameterCoverage: 1,
  weaponTypeCoverage: 1,
  requiredCategoryCoverage: 1,
  weaponSlotCoverage: 1,
  communityEquipmentAliasFormalUnique: 48,
  communityGlossaryAliasFormalUnique: 5,
  currencyIconCoverage: 1,
  goldenFixtureSearchPass: 1,
  goldenFixturePass: 1,
};
const checks = Object.fromEntries(
  Object.entries(thresholds).map(([key, threshold]) => [
    key,
    {
      value: metrics[key],
      threshold,
      ok: metrics[key] >= threshold,
    },
  ]),
);
const report = {
  status: Object.values(checks).every((check) => check.ok)
    ? "ready"
    : "blocked",
  metrics,
  thresholds,
  checks,
  notes: [
    "raw 同步范围按 Wiki 分类清单逐项对账；normalized-but-not-searchable 单独列出，不能静默从报告消失。",
    "正式目录只包含 admissionStatus=admitted；quarantine 条目不进入首页搜索。",
    "demolition 值按有字段且有来源的组件计数；缺失不等于 0，也不构成失败。",
    "图片门禁要求具体 file page、原始 URL、revision/oldid、hash 与具体 license raw 值；author 可为空且不得臆造，License/ 等模板残片不算 documented。",
    "债券 Contents 反向索引按 canonical equipment page 对账；只统计产品支持类别，未知价格或未准入条目保留在 missingFromAdmitted，不以债券页总价代替物品成本。",
  ],
};
const reportPath = resolve(root, "reports/release-readiness.json");
await mkdir(resolve(root, "reports"), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.status !== "ready") process.exitCode = 1;
