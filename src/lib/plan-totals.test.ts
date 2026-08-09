import type { Equipment, PlanState } from "../types";
import { describe, expect, it } from "vitest";
import { summarizePlanCosts } from "./plan-totals";

const source = { kind: "manual" as const, label: "test" };
const item = (
  id: string,
  page: number,
  itemMedals: number,
  pageUnlockMedals: number,
): Equipment => ({
  id,
  model: id,
  nameZh: id,
  nameEn: id,
  category: "weapon",
  image: {
    path: "assets/placeholder-equipment.svg",
    alt: id,
    status: "placeholder",
    originalPage: null,
    author: "test",
    syncedAt: "2026-01-01T00:00:00.000Z",
    fileHash: null,
    sourceRefs: [source],
    licenseStatus: "project-created-placeholder",
  },
  aliases: [],
  acquisition: {
    kind: "warbond",
    warbondId: "bond",
    page,
    itemMedals,
    pageUnlockMedals,
  },
  sourceRefs: [source],
  verificationStatus: "verified",
  admissionStatus: "admitted",
  translationEvidence: [],
  notes: "",
  search: {
    model: id,
    modelFormalName: id,
    formalName: id,
    englishName: id,
    aliases: [],
    pinyinFull: [],
    pinyinInitials: [],
  },
});

describe("plan cost summaries", () => {
  it("separates item medals from the highest shared page threshold", () => {
    const plan: PlanState = {
      schemaVersion: 2,
      pendingIds: ["one", "two", "later"],
      completedIds: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const result = summarizePlanCosts(
      plan,
      new Map([
        ["one", item("one", 1, 20, 0)],
        ["two", item("two", 1, 30, 0)],
        ["later", item("later", 2, 40, 80)],
      ]),
    );
    expect(result.warbonds).toEqual([
      { warbondId: "bond", itemMedals: 90, highestPageUnlockMedals: 80 },
    ]);
    expect(result.warbonds[0]).not.toHaveProperty("totalMedals");
  });
});
