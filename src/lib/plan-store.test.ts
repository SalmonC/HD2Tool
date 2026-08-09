import { describe, expect, it } from "vitest";
import {
  createEmptyPlan,
  exportPlan,
  importPlan,
  loadPlanState,
  PLAN_RECOVERY_KEY,
  reducePlan,
  savePlanState,
} from "./plan-store";

const knownIds = ["a", "b", "c"];

describe("plan store", () => {
  it("adds, reorders, completes, restores and removes items", () => {
    let plan = createEmptyPlan("2026-08-08T00:00:00.000Z");
    plan = reducePlan(plan, { type: "add", id: "a" }, knownIds);
    plan = reducePlan(plan, { type: "add", id: "b" }, knownIds);
    plan = reducePlan(plan, { type: "move", id: "b", toIndex: 0 }, knownIds);
    expect(plan.pendingIds).toEqual(["b", "a"]);
    plan = reducePlan(plan, { type: "complete", id: "b" }, knownIds);
    expect(plan.pendingIds).toEqual(["a"]);
    expect(plan.completedIds).toEqual(["b"]);
    plan = reducePlan(plan, { type: "restore", id: "b" }, knownIds);
    expect(plan.pendingIds).toEqual(["a", "b"]);
    plan = reducePlan(plan, { type: "remove", id: "a" }, knownIds);
    expect(plan.pendingIds).toEqual(["b"]);
  });

  it("persists the versioned schema and migrates schema zero", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } as unknown as Storage;
    const plan = reducePlan(
      createEmptyPlan(),
      { type: "add", id: "a" },
      knownIds,
    );
    savePlanState(storage, plan);
    expect(loadPlanState(storage, knownIds).state.pendingIds).toEqual(["a"]);
    values.set(
      "hd2-supply-book:plan:v1",
      JSON.stringify({ schemaVersion: 0, items: ["c"] }),
    );
    values.delete("hd2-supply-book:plan:v2");
    expect(loadPlanState(storage, knownIds).migrated).toBe(true);
    expect(loadPlanState(storage, knownIds).state.pendingIds).toEqual(["c"]);
  });

  it("round trips export and rejects corrupted or unknown imports", () => {
    const plan = reducePlan(
      createEmptyPlan(),
      { type: "add", id: "a" },
      knownIds,
    );
    expect(importPlan(exportPlan(plan), knownIds).pendingIds).toEqual(["a"]);
    expect(() =>
      importPlan(
        '{"schemaVersion":1,"pendingIds":["unknown"],"completedIds":[]}',
        knownIds,
      ),
    ).toThrow("未知装备 ID");
    expect(() =>
      importPlan(
        '{"schemaVersion":1,"pendingIds":["a"],"completedIds":["a"]}',
        knownIds,
      ),
    ).toThrow("重复");
    expect(loadPlanState(null, knownIds).error).toBeTruthy();
  });

  it("preserves a bounded recovery copy and reports orphan IDs", () => {
    const values = new Map<string, string>([
      ["hd2-supply-book:plan:v2", "{broken"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const corrupted = loadPlanState(storage, knownIds);
    expect(corrupted.error).toContain("恢复副本");
    expect(values.get(PLAN_RECOVERY_KEY)).toBe("{broken");
    expect(values.get("hd2-supply-book:plan:v2")).toBeUndefined();

    values.set(
      "hd2-supply-book:plan:v2",
      JSON.stringify({
        schemaVersion: 2,
        pendingIds: ["a", "orphan"],
        completedIds: [],
      }),
    );
    const orphaned = loadPlanState(storage, knownIds);
    expect(orphaned.orphanedIds).toEqual(["orphan"]);
    expect(orphaned.state.pendingIds).toEqual(["a"]);
  });
});
