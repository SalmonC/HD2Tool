import { describe, expect, it } from "vitest";
import attackTaxonomy from "./source/attack-taxonomy.json";
import rawSnapshot from "./source/wiki-raw.json";
import { normalizeEquipmentPage } from "../../scripts/wiki-normalize.mjs";

const capturedAt = "2026-08-08T00:00:00.000Z";
const regressionPages = [
  [12637, "ar-32-pacifier"],
  [13826, "ar-2-coyote"],
  [14685, "ar-gl-21-one-two"],
] as const;

describe("Wiki Weapon-template normalization against the frozen snapshot", () => {
  it.each(regressionPages)(
    "normalizes pageId %s as %s with sourced acquisition",
    (pageId, expectedId) => {
      const page = rawSnapshot.pages.find(
        (candidate) => candidate.pageid === pageId,
      );
      expect(page, `missing raw page ${pageId}`).toBeDefined();
      const item = normalizeEquipmentPage(page!, {
        capturedAt,
        attackTaxonomy,
        warbondThresholds: {},
        warbondThresholdSources: {},
        warbondContentsById: new Map(),
        imagesByTitle: {},
      });
      expect(item).toMatchObject({
        id: expectedId,
        category: "weapon",
        slot: "primary",
        acquisition: {
          kind: "warbond",
          page: 1,
          itemMedals: 35,
        },
      });
    },
  );
});
