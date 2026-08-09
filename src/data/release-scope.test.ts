import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import legacyScope from "./migrations/release-scope.legacy.fixture.json";
import productScope from "./source/product-scope.v2.json";

const coverage = JSON.parse(
  readFileSync(
    new URL("../../reports/product-scope-coverage.json", import.meta.url),
    "utf8",
  ),
);

describe("legacy release-scope is not product range truth", () => {
  it("uses product-scope.v2 for the full inventory instead of hand-copied entries", () => {
    expect(productScope.schemaVersion).toBe("product-scope.v2");
    expect(coverage.productScopeManifest).toBe(
      "src/data/source/product-scope.v2.json",
    );
    expect(coverage.scopeManifestMissingIds ?? []).toEqual([]);
    expect(coverage.normalizedRequired).toBe(292);
    expect(legacyScope.active).toBe(false);
  });

  it("does not let legacy booster required entries affect current scope", () => {
    const legacyBoosters = legacyScope.entries.filter(
      (entry: { id: string; scopeClass: string }) =>
        entry.scopeClass === "required" &&
        coverage.excludedIds.includes(entry.id),
    );
    expect(legacyBoosters.length).toBeGreaterThan(0);
    expect(
      coverage.excludedIds.every(
        (id: string) => !coverage.expectedCatalogIds.includes(id),
      ),
    ).toBe(true);
  });

  it("keeps the six dated upcoming items out of current required admission", () => {
    expect(coverage.upcomingIds).toHaveLength(6);
    expect(coverage.upcomingIds).toEqual(
      expect.arrayContaining([
        "40-k-meltagun",
        "g-40-k-meltamine",
        "p-40-k-bolt-pistol",
        "r-40-k-hot-shot-marksman-rifle",
        "tg-122-demo-trooper",
        "tg-8-sharpshooter",
      ]),
    );
  });
});
