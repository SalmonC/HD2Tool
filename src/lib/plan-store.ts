import type { PlanLoadResult, PlanState } from "../types";

export const PLAN_STORAGE_KEY = "hd2-supply-book:plan:v2";
export const PLAN_SCHEMA_VERSION = 2 as const;

export type PlanAction =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "complete"; id: string }
  | { type: "restore"; id: string };

function now(): string {
  return new Date().toISOString();
}

export function createEmptyPlan(): PlanState {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    pendingIds: [],
    completedIds: [],
    updatedAt: now(),
  };
}

function uniqueKnown(
  value: unknown,
  knownIds: Set<string>,
  idAliases: Record<string, string>,
): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => idAliases[id] ?? id)
        .filter((id) => knownIds.has(id)),
    ),
  ];
}

export function loadPlanState(
  storage: Storage | null,
  knownIds: Iterable<string>,
  idAliases: Record<string, string>,
): PlanLoadResult {
  if (!storage)
    return { state: createEmptyPlan(), error: "当前环境无法使用本地存储。" };
  const raw = storage.getItem(PLAN_STORAGE_KEY);
  if (!raw) return { state: createEmptyPlan() };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.schemaVersion !== undefined &&
      parsed.schemaVersion !== PLAN_SCHEMA_VERSION
    ) {
      storage.removeItem(PLAN_STORAGE_KEY);
      return {
        state: createEmptyPlan(),
        error: "购买计划版本不受支持，已重置。",
      };
    }
    const known = new Set(knownIds);
    const pendingIds = uniqueKnown(parsed.pendingIds, known, idAliases);
    const pending = new Set(pendingIds);
    const completedIds = uniqueKnown(
      parsed.completedIds,
      known,
      idAliases,
    ).filter((id) => !pending.has(id));
    return {
      state: {
        schemaVersion: PLAN_SCHEMA_VERSION,
        pendingIds,
        completedIds,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : now(),
      },
    };
  } catch {
    storage.removeItem(PLAN_STORAGE_KEY);
    return { state: createEmptyPlan(), error: "购买计划数据损坏，已重置。" };
  }
}

export function reducePlan(
  state: PlanState,
  action: PlanAction,
  knownIds: Iterable<string>,
): PlanState {
  const known = new Set(knownIds);
  if (!known.has(action.id)) return state;
  let pendingIds = state.pendingIds.slice();
  let completedIds = state.completedIds.slice();
  switch (action.type) {
    case "add":
      if (!pendingIds.includes(action.id) && !completedIds.includes(action.id))
        pendingIds.push(action.id);
      break;
    case "remove":
      pendingIds = pendingIds.filter((id) => id !== action.id);
      completedIds = completedIds.filter((id) => id !== action.id);
      break;
    case "complete":
      if (pendingIds.includes(action.id)) {
        pendingIds = pendingIds.filter((id) => id !== action.id);
        completedIds.push(action.id);
      }
      break;
    case "restore":
      if (completedIds.includes(action.id)) {
        completedIds = completedIds.filter((id) => id !== action.id);
        pendingIds.push(action.id);
      }
      break;
  }
  return { ...state, pendingIds, completedIds, updatedAt: now() };
}

export function savePlanState(storage: Storage | null, state: PlanState): void {
  storage?.setItem(PLAN_STORAGE_KEY, JSON.stringify(state));
}
