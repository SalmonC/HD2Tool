import { describe, expect, it } from "vitest";
import {
  createEmptyPlan,
  loadPlanState,
  reducePlan,
  savePlanState,
} from "./plan-store";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("plan store", () => {
  it("adds, completes, restores and persists the existing v2 shape", () => {
    const known = ["one"];
    let state = reducePlan(
      createEmptyPlan(),
      { type: "add", id: "one" },
      known,
    );
    state = reducePlan(state, { type: "complete", id: "one" }, known);
    expect(state.completedIds).toEqual(["one"]);
    state = reducePlan(state, { type: "restore", id: "one" }, known);
    const storage = new MemoryStorage();
    savePlanState(storage, state);
    expect(loadPlanState(storage, known, {}).state.pendingIds).toEqual(["one"]);
  });

  it("applies stable id aliases while loading", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "hd2-supply-book:plan:v2",
      JSON.stringify({
        pendingIds: ["old"],
        completedIds: [],
        updatedAt: "now",
      }),
    );
    expect(
      loadPlanState(storage, ["new"], { old: "new" }).state.pendingIds,
    ).toEqual(["new"]);
  });

  it("rejects unknown schema versions without keeping stale data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "hd2-supply-book:plan:v2",
      JSON.stringify({
        schemaVersion: 99,
        pendingIds: ["one"],
        completedIds: [],
      }),
    );
    const loaded = loadPlanState(storage, ["one"], {});
    expect(loaded.state.pendingIds).toEqual([]);
    expect(loaded.error).toContain("版本不受支持");
    expect(storage.getItem("hd2-supply-book:plan:v2")).toBeNull();
  });
});
