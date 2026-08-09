import { describe, expect, it } from "vitest";
import { catalog, findEquipment, itemsById } from "../data/catalog";
import { createEmptyPlan } from "./plan-store";
import { summarizePlanCosts } from "./plan-totals";

describe("plan totals", () => {
  it("sums item medals and keeps only the highest page prerequisite", () => {
    const ids = ["ma5c-assault-rifle", "m90a-shotgun"].filter((id) =>
      findEquipment(id),
    );
    const plan = { ...createEmptyPlan(), pendingIds: ids };
    const totals = summarizePlanCosts(plan, itemsById, catalog);
    expect(totals.warbonds).toEqual([
      {
        warbondId: "obedient-democracy-support-troopers-legendary",
        itemMedals: 100,
        highestPageUnlockMedals: 415,
      },
    ]);
  });
});
