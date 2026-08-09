import { describe, expect, it } from "vitest";
import thresholds from "./source/warbond-page-thresholds.json";

describe("warbond cumulative page thresholds", () => {
  it("keeps independently evidenced page-2 cumulative values", () => {
    const expected = new Map([
      ["obedient-democracy-support-troopers-legendary", 135],
      ["urban-legends", 160],
      ["righteous-revenants-legendary", 135],
      ["masters-of-ceremony", 95],
      ["servants-of-freedom", 95],
      ["truth-enforcers", 90],
    ]);
    for (const [warbondId, cumulative] of expected) {
      const record = thresholds.records.find(
        (candidate) => candidate.warbondId === warbondId,
      );
      expect(record, warbondId).toBeDefined();
      expect(record?.pages.find((page) => page.page === 2)).toMatchObject({
        incrementalMedals: cumulative,
        cumulativeMedals: cumulative,
      });
      expect(record?.sourceRefs.length, warbondId).toBeGreaterThan(0);
    }
  });

  it("does not treat a page item total as the page unlock threshold", () => {
    const truth = thresholds.records.find(
      (record) => record.warbondId === "truth-enforcers",
    );
    expect(truth?.pages.find((page) => page.page === 2)?.cumulativeMedals).toBe(
      90,
    );
    expect(
      truth?.pages.find((page) => page.page === 2)?.cumulativeMedals,
    ).not.toBe(329);
  });
});
