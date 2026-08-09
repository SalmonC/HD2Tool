import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "./source/product-scope.v2.json";
import {
  catalogUnexpectedPass,
  classifyFormalCatalogUnexpectedIds,
  PRODUCT_GROUPS,
  classifyProductScope,
  matchingProductScopeRules,
} from "../../scripts/lib/product-scope.mjs";

const catalog = JSON.parse(
  readFileSync(new URL("./catalog.json", import.meta.url), "utf8"),
);
const coverage = JSON.parse(
  readFileSync(
    new URL("../../reports/product-scope-coverage.json", import.meta.url),
    "utf8",
  ),
);
const disposition = JSON.parse(
  readFileSync(
    new URL("../../reports/wiki-page-disposition.json", import.meta.url),
    "utf8",
  ),
);
const normalized = JSON.parse(
  readFileSync(
    new URL("./source/wiki-normalized.json", import.meta.url),
    "utf8",
  ),
);

describe("product scope v2", () => {
  it("is the single range manifest and has disjoint effective rules", () => {
    expect(manifest.schemaVersion).toBe("product-scope.v2");
    expect(PRODUCT_GROUPS).toEqual([
      "primary-weapon",
      "secondary-weapon",
      "grenade",
      "body-armor",
      "support-weapon",
      "other-stratagem",
    ]);
    expect(
      normalized.items.every(
        (item: { id: string; category?: string; slot?: string }) =>
          matchingProductScopeRules(item).length >= 1,
      ),
    ).toBe(true);
  });

  it("keeps product group separate from availability and disposition", () => {
    const upcoming = classifyProductScope({
      id: "r-40-k-hot-shot-marksman-rifle",
      category: "weapon",
      slot: "primary",
    });
    expect(upcoming).toMatchObject({
      productGroup: "primary-weapon",
      availability: "upcoming",
      scopeDisposition: "upcoming",
    });
    expect(
      matchingProductScopeRules({
        id: "r-40-k-hot-shot-marksman-rifle",
        category: "weapon",
        slot: "primary",
      }).map((rule) => rule.ruleId),
    ).toEqual(["primary-weapon", "upcoming-castellans-creed"]);
    const system = classifyProductScope({
      id: "reinforce",
      category: "stratagem",
      slot: "stratagem",
    });
    expect(system).toMatchObject({
      productGroup: "other-stratagem",
      availability: "excluded",
      scopeDisposition: "excluded",
    });
  });

  it("classifies every formal catalog counterexample and blocks any one", () => {
    const scopeById = new Map([
      ["released", { scopeClass: "required" }],
      ["upcoming", { scopeClass: "upcoming" }],
      ["excluded", { scopeClass: "out-of-product-scope" }],
    ]);
    expect(
      classifyFormalCatalogUnexpectedIds(["released"], ["released"], scopeById),
    ).toEqual([]);
    const unexpected = classifyFormalCatalogUnexpectedIds(
      ["released", "upcoming", "excluded", "unknown"],
      ["released"],
      scopeById,
    );
    expect(unexpected).toEqual([
      { id: "excluded", classification: "out-of-scope-leaked" },
      { id: "unknown", classification: "unknown" },
      { id: "upcoming", classification: "upcoming-leaked" },
    ]);
    expect(catalogUnexpectedPass([])).toBe(true);
    expect(catalogUnexpectedPass(unexpected)).toBe(false);
  });

  it("keeps support weapons in stratagem scope and excludes booster/system IDs", () => {
    expect(
      classifyProductScope({
        id: "ac-8-autocannon",
        category: "weapon",
        slot: "support",
      }).productGroup,
    ).toBe("support-weapon");
    expect(
      classifyProductScope({ id: "muscle-enhancement", category: "booster" })
        .scopeClass,
    ).toBe("out-of-product-scope");
    expect(
      classifyProductScope({
        id: "reinforce",
        category: "stratagem",
        slot: "stratagem",
      }).reason,
    ).toBe("system-action");
  });

  it("accounts for the frozen inventory without manufacturing pending entries", () => {
    expect(coverage.rawWikiPages).toBe(467);
    expect(coverage.normalizedWikiItems).toBe(321);
    expect(coverage.normalizedRequired).toBe(292);
    expect(coverage.normalizedUpcoming).toBe(6);
    expect(coverage.normalizedOutOfProductScope).toBe(23);
    expect(coverage.releasedInScopeAdmitted).toBe(292);
    expect(coverage.releasedInScopeMissing).toBe(0);
    expect(coverage.ruleErrors).toEqual([]);
    expect(coverage.duplicateStableIds).toEqual([]);
    expect(coverage.expectedNotInCatalogIds).toEqual([]);
    expect(coverage.catalogNotInExpectedIds).toEqual([]);
    expect(coverage.parseErrorPages).toEqual([]);
    expect(coverage.scopeManifestMissingIds ?? []).toEqual([]);
  });

  it("gives every raw page exactly one disposition", () => {
    expect(disposition.pages).toHaveLength(467);
    expect(disposition.invariants.everyRawPageHasDisposition).toBe(true);
    expect(disposition.dispositionCounts).toEqual({
      normalized: 321,
      excluded: 140,
      redirect: 0,
      duplicate: 6,
      "parse-error": 0,
    });
  });

  it("does not put out-of-scope IDs in the generated catalog", () => {
    const ids = [...catalog.items, ...(catalog.quarantine ?? [])].map(
      (item: { id: string }) => item.id,
    );
    expect(ids.some((id: string) => coverage.excludedIds.includes(id))).toBe(
      false,
    );
    expect(ids.some((id: string) => coverage.upcomingIds.includes(id))).toBe(
      true,
    );
  });

  it("has one v2 product-scope report writer", () => {
    const generator = readFileSync(
      new URL("../../scripts/generate-data.mjs", import.meta.url),
      "utf8",
    );
    const checker = readFileSync(
      new URL("../../scripts/check-product-scope.mjs", import.meta.url),
      "utf8",
    );
    expect(generator).not.toContain("product-scope-coverage.json");
    expect(
      checker.match(
        /writeFile\(\s*resolve\(root, "reports\/product-scope-coverage\.json"/g,
      ),
    ).toHaveLength(1);
    expect(coverage.schemaVersion).toBe("product-scope-coverage.v2");
  });
});
