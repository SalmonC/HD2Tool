import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import prettier from "prettier";
import {
  PRODUCT_GROUPS,
  PRODUCT_SCOPE_MANIFEST,
  classifyProductScope,
  classifyFormalCatalogUnexpectedIds,
  catalogUnexpectedPass,
  matchingProductScopeRules,
  productGroupForItem,
} from "./lib/product-scope.mjs";

const root = resolve(import.meta.dirname, "..");
const load = async (relativePath) =>
  JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
const raw = await load("src/data/source/wiki-raw.json");
const normalized = await load("src/data/source/wiki-normalized.json");
const catalog = await load("src/data/catalog.json");

const rawPages = Array.isArray(raw.pages) ? raw.pages : [];
const normalizedItems = Array.isArray(normalized.items) ? normalized.items : [];
const formalItems = Array.isArray(catalog.items) ? catalog.items : [];
const auditItems = [
  ...formalItems,
  ...(Array.isArray(catalog.quarantine) ? catalog.quarantine : []),
];
const sourcePageFor = (item) =>
  (item.sourceRefs ?? []).find((ref) => ref.kind === "wiki") ?? null;
const normalizedPageById = new Map(
  normalizedItems.map((item) => [sourcePageFor(item)?.pageId, item]),
);
const stableIdCounts = new Map();
for (const item of normalizedItems) {
  stableIdCounts.set(item.id, (stableIdCounts.get(item.id) ?? 0) + 1);
}
const duplicateStableIds = [...stableIdCounts]
  .filter(([, count]) => count !== 1)
  .map(([id]) => id)
  .sort();

const rawPageSeen = new Set();
const dispositionFor = (page) => {
  if (rawPageSeen.has(page.pageid)) {
    return { disposition: "duplicate", reason: "duplicate-raw-page-id" };
  }
  rawPageSeen.add(page.pageid);
  const normalizedItem = normalizedPageById.get(page.pageid);
  if (normalizedItem) {
    return {
      disposition: "normalized",
      reason: "normalized-equipment-item",
      normalizedItemId: normalizedItem.id,
    };
  }
  const title = String(page.title ?? "");
  const categories = new Set(page.categories ?? []);
  if (
    /(?:\/zh(?:-[a-z-]+)?)$/iu.test(title) ||
    categories.has("ZH translation")
  ) {
    return { disposition: "duplicate", reason: "language-mirror-page" };
  }
  if (categories.has("Warbonds") || /warbond/iu.test(title)) {
    return { disposition: "excluded", reason: "warbond-reference-page" };
  }
  if (
    categories.has("Cosmetics") ||
    categories.has("Capes") ||
    categories.has("Player Cards")
  ) {
    return { disposition: "excluded", reason: "cosmetic-out-of-product-scope" };
  }
  if (categories.has("Boosters")) {
    return { disposition: "excluded", reason: "booster-out-of-product-scope" };
  }
  const productPageHint = [
    "Weapons",
    "Primary Weapons",
    "Secondary Weapons",
    "Support Weapons",
    "Armor",
    "Throwables",
    "Grenades",
  ].some((category) => categories.has(category));
  if (
    productPageHint &&
    /\{\{\s*(?:Weapon|Infobox\s+(?:Armor|Stratagem|Throwable)|Throwable)\s*(?:\||\n|$)/iu.test(
      page.wikitext ?? "",
    )
  ) {
    return {
      disposition: "parse-error",
      reason: "equipment-template-not-normalized",
    };
  }
  return { disposition: "excluded", reason: "reference-or-nonproduct-page" };
};

const dispositions = rawPages.map((page) => {
  const result = dispositionFor(page);
  return {
    pageId: page.pageid,
    title: page.title,
    url: page.url,
    revision: page.revid,
    ...result,
  };
});
const dispositionCounts = Object.fromEntries(
  ["normalized", "excluded", "redirect", "duplicate", "parse-error"].map(
    (disposition) => [
      disposition,
      dispositions.filter((entry) => entry.disposition === disposition).length,
    ],
  ),
);

const formalIds = new Set(formalItems.map((item) => item.id));
const normalizedIds = new Set(normalizedItems.map((item) => item.id));
const auditIds = new Set(auditItems.map((item) => item.id));
const classificationRows = normalizedItems.map((item) => {
  const rules = matchingProductScopeRules(item);
  const scope = classifyProductScope(item);
  const groupRuleIds = rules
    .filter((rule) => PRODUCT_SCOPE_MANIFEST.groups.includes(rule))
    .map((rule) => rule.ruleId);
  const dispositionRuleIds = rules
    .filter((rule) => PRODUCT_SCOPE_MANIFEST.exclusions.includes(rule))
    .map((rule) => rule.ruleId);
  const ruleAccountingValid =
    scope.scopeClass === "required"
      ? groupRuleIds.length === 1 && dispositionRuleIds.length === 0
      : scope.scopeClass === "upcoming"
        ? groupRuleIds.length === 1 &&
          dispositionRuleIds.length === 1 &&
          dispositionRuleIds[0] === scope.ruleId
        : scope.scopeClass === "out-of-product-scope"
          ? groupRuleIds.length <= 1 &&
            (dispositionRuleIds.length === 1 ||
              (dispositionRuleIds.length === 0 &&
                scope.ruleId === "unsupported-category"))
          : false;
  return {
    id: item.id,
    productGroup: productGroupForItem(item),
    scopeClass: scope.scopeClass,
    availability: scope.availability,
    scopeDisposition: scope.scopeDisposition,
    ruleId: scope.ruleId,
    matchedRuleIds: rules.map((rule) => rule.ruleId),
    ruleCount: rules.length,
    groupRuleIds,
    dispositionRuleIds,
    ruleAccountingValid,
  };
});
const ruleErrors = classificationRows
  .filter((row) => !row.ruleAccountingValid)
  .map((row) => ({
    id: row.id,
    matchedRuleIds: row.matchedRuleIds,
    groupRuleIds: row.groupRuleIds,
    dispositionRuleIds: row.dispositionRuleIds,
  }));
const scopeById = new Map(classificationRows.map((row) => [row.id, row]));
const requiredRows = classificationRows.filter(
  (row) => row.scopeClass === "required",
);
const upcomingRows = classificationRows.filter(
  (row) => row.scopeClass === "upcoming",
);
const excludedRows = classificationRows.filter(
  (row) => row.scopeClass === "out-of-product-scope",
);
const expectedIds = requiredRows.map((row) => row.id).sort();
const expectedReleasedIds = expectedIds;
const formalCatalogIds = [...formalIds].sort();
const admittedIds = expectedReleasedIds.filter((id) => formalIds.has(id));
const expectedNotInCatalogIds = expectedReleasedIds.filter(
  (id) => !formalIds.has(id),
);
const catalogUnexpectedDetails = classifyFormalCatalogUnexpectedIds(
  formalCatalogIds,
  expectedReleasedIds,
  scopeById,
);
const catalogNotInExpectedIds = catalogUnexpectedDetails.map(
  (entry) => entry.id,
);

const byGroup = Object.fromEntries(
  PRODUCT_GROUPS.map((group) => {
    const expected = requiredRows.filter((row) => row.productGroup === group);
    const upcoming = upcomingRows.filter((row) => row.productGroup === group);
    const excluded = excludedRows.filter((row) => row.productGroup === group);
    return [
      group,
      {
        expected: expected.length,
        admitted: expected.filter((row) => formalIds.has(row.id)).length,
        missing: expected
          .filter((row) => !formalIds.has(row.id))
          .map((row) => row.id)
          .sort(),
        excluded: excluded.length,
        excludedIds: excluded.map((row) => row.id).sort(),
        upcoming: upcoming.length,
        upcomingIds: upcoming.map((row) => row.id).sort(),
        catalogUnexpected: [],
      },
    ];
  }),
);

const allKnownIds = new Set(normalizedItems.map((item) => item.id));
const dispositionReport = {
  schemaVersion: "wiki-page-disposition.v1",
  generatedAt: new Date().toISOString(),
  source: {
    rawSnapshot: "src/data/source/wiki-raw.json",
    rawSnapshotComplete: raw.rawSnapshotComplete === true,
    pageCount: rawPages.length,
  },
  dispositionCounts,
  pages: dispositions,
  invariants: {
    everyRawPageHasDisposition: dispositions.length === rawPages.length,
    allowedDispositions: [
      "normalized",
      "excluded",
      "redirect",
      "duplicate",
      "parse-error",
    ],
  },
};

const coverageReport = {
  schemaVersion: "product-scope-coverage.v2",
  productScopeManifest: "src/data/source/product-scope.v2.json",
  rawWikiPages: rawPages.length,
  normalizedWikiItems: normalizedItems.length,
  normalizedRequired: requiredRows.length,
  normalizedUpcoming: upcomingRows.length,
  normalizedOutOfProductScope: excludedRows.length,
  releasedInScopeAdmitted: admittedIds.length,
  releasedInScopeMissing: expectedNotInCatalogIds.length,
  admittedCatalogItems: formalItems.length,
  catalogQuarantineItems: auditItems.length - formalItems.length,
  relation: {
    rawToNormalized: `${rawPages.length} raw pages contains ${normalizedItems.length} normalized equipment items and ${rawPages.length - normalizedItems.length} other/reference pages`,
    normalizedToScope: `${requiredRows.length} required + ${upcomingRows.length} upcoming + ${excludedRows.length} out-of-product-scope`,
    releasedToCatalog: `${admittedIds.length} required admitted + ${expectedNotInCatalogIds.length} required missing + ${upcomingRows.length} upcoming quarantine`,
  },
  byGroup,
  expectedReleasedIds,
  formalCatalogIds,
  expectedCatalogIds: expectedReleasedIds,
  catalogExpectedIds: formalCatalogIds,
  expectedNotInCatalogIds,
  catalogNotInExpectedIds,
  catalogUnexpectedDetails,
  excludedIds: excludedRows.map((row) => row.id).sort(),
  upcomingIds: upcomingRows.map((row) => row.id).sort(),
  ruleErrors,
  duplicateStableIds,
  dispositionCounts,
  parseErrorPages: dispositions
    .filter((entry) => entry.disposition === "parse-error")
    .map((entry) => ({ pageId: entry.pageId, title: entry.title })),
  unresolvedIds: [
    ...new Set([...expectedNotInCatalogIds, ...ruleErrors.map((e) => e.id)]),
  ].sort(),
  unresolvedPageIds: dispositions
    .filter((entry) => entry.disposition === "parse-error")
    .map((entry) => ({ pageId: entry.pageId, title: entry.title }))
    .sort((a, b) => a.pageId - b.pageId),
  invariants: {
    rawSnapshotComplete: raw.rawSnapshotComplete === true,
    rawPageDispositionComplete: dispositions.length === rawPages.length,
    normalizedStableIdsUnique: duplicateStableIds.length === 0,
    normalizedItemsExactlyOneScopeRule:
      ruleErrors.length === 0 &&
      classificationRows.length === normalizedItems.length,
    parseErrorFree: dispositionCounts["parse-error"] === 0,
    expectedCatalogReconciled:
      expectedNotInCatalogIds.length === 0 &&
      catalogNotInExpectedIds.length === 0,
    catalogNoUnexpected: catalogUnexpectedPass(catalogUnexpectedDetails),
    normalizedAccounting:
      requiredRows.length + upcomingRows.length + excludedRows.length ===
      normalizedItems.length,
    noUnknownNormalizedIds: classificationRows.every((row) =>
      allKnownIds.has(row.id),
    ),
  },
};

await writeFile(
  resolve(root, "reports/wiki-page-disposition.json"),
  await prettier.format(JSON.stringify(dispositionReport), { parser: "json" }),
  "utf8",
);
await writeFile(
  resolve(root, "reports/product-scope-coverage.json"),
  await prettier.format(JSON.stringify(coverageReport), { parser: "json" }),
  "utf8",
);

const failures = [];
if (!coverageReport.invariants.rawSnapshotComplete)
  failures.push("rawSnapshotComplete");
if (!coverageReport.invariants.rawPageDispositionComplete)
  failures.push("rawPageDispositionComplete");
if (!coverageReport.invariants.normalizedStableIdsUnique)
  failures.push("duplicateStableIds");
if (!coverageReport.invariants.normalizedItemsExactlyOneScopeRule)
  failures.push("scopeRuleAccounting");
if (!coverageReport.invariants.parseErrorFree) failures.push("parseErrors");
if (!coverageReport.invariants.catalogNoUnexpected)
  failures.push("catalogUnexpected");
if (!coverageReport.invariants.normalizedAccounting)
  failures.push("normalizedAccounting");
if (failures.length) {
  console.error(`Product scope check failed: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Product scope: raw=${rawPages.length}, normalized=${normalizedItems.length}, required=${requiredRows.length}, admitted=${admittedIds.length}, missing=${expectedNotInCatalogIds.length}, upcoming=${upcomingRows.length}, out-of-scope=${excludedRows.length}`,
  );
  console.log(`Page dispositions: ${JSON.stringify(dispositionCounts)}`);
}
