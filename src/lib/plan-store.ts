import type { PlanLoadResult, PlanState } from "../types";

export const PLAN_STORAGE_KEY = "hd2-supply-book:plan:v1";
export const PLAN_SCHEMA_VERSION = 1 as const;

export type PlanAction =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "complete"; id: string }
  | { type: "restore"; id: string }
  | { type: "remove-completed"; id: string }
  | { type: "move"; id: string; toIndex: number };

function timestamp(): string {
  return new Date().toISOString();
}

export function createEmptyPlan(now = timestamp()): PlanState {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    pendingIds: [],
    completedIds: [],
    updatedAt: now,
  };
}

function dedupeKnown(ids: unknown, knownIds: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((id): id is string => typeof id === "string" && knownIds.has(id))
    .filter((id, index, list) => list.indexOf(id) === index);
}

export function sanitizePlan(
  state: PlanState,
  knownIds: Iterable<string>,
): PlanState {
  const known = new Set(knownIds);
  const pendingIds = dedupeKnown(state.pendingIds, known);
  const completedIds = dedupeKnown(state.completedIds, known).filter(
    (id) => !pendingIds.includes(id),
  );
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    pendingIds,
    completedIds,
    updatedAt: state.updatedAt || timestamp(),
  };
}

export function reducePlan(
  state: PlanState,
  action: PlanAction,
  knownIds: Iterable<string>,
): PlanState {
  const known = new Set(knownIds);
  if (!known.has(action.id) && action.type !== "move") return state;
  const next = sanitizePlan(state, known);
  switch (action.type) {
    case "add":
      if (
        next.pendingIds.includes(action.id) ||
        next.completedIds.includes(action.id)
      )
        return next;
      return {
        ...next,
        pendingIds: [...next.pendingIds, action.id],
        updatedAt: timestamp(),
      };
    case "remove":
      return {
        ...next,
        pendingIds: next.pendingIds.filter((id) => id !== action.id),
        completedIds: next.completedIds.filter((id) => id !== action.id),
        updatedAt: timestamp(),
      };
    case "complete":
      if (!next.pendingIds.includes(action.id)) return next;
      return {
        ...next,
        pendingIds: next.pendingIds.filter((id) => id !== action.id),
        completedIds: [...next.completedIds, action.id],
        updatedAt: timestamp(),
      };
    case "restore":
      if (!next.completedIds.includes(action.id)) return next;
      return {
        ...next,
        completedIds: next.completedIds.filter((id) => id !== action.id),
        pendingIds: [...next.pendingIds, action.id],
        updatedAt: timestamp(),
      };
    case "remove-completed":
      return {
        ...next,
        completedIds: next.completedIds.filter((id) => id !== action.id),
        updatedAt: timestamp(),
      };
    case "move": {
      const currentIndex = next.pendingIds.indexOf(action.id);
      if (currentIndex < 0) return next;
      const pendingIds = next.pendingIds.slice();
      pendingIds.splice(currentIndex, 1);
      const target = Math.max(0, Math.min(action.toIndex, pendingIds.length));
      pendingIds.splice(target, 0, action.id);
      return { ...next, pendingIds, updatedAt: timestamp() };
    }
  }
}

function parseState(
  value: unknown,
  knownIds: Set<string>,
  strict: boolean,
): PlanState {
  if (typeof value !== "object" || value === null)
    throw new Error("计划必须是 JSON 对象。");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== PLAN_SCHEMA_VERSION)
    throw new Error("不支持的计划 schema 版本。");
  if (!Array.isArray(record.pendingIds) || !Array.isArray(record.completedIds))
    throw new Error("计划缺少 pendingIds 或 completedIds。");
  const allIds = [...record.pendingIds, ...record.completedIds];
  if (!allIds.every((id) => typeof id === "string"))
    throw new Error("计划 ID 必须是字符串。");
  if (new Set(allIds).size !== allIds.length)
    throw new Error("计划中存在重复或同时待购/完成的 ID。");
  const unknown = allIds.filter((id) => !knownIds.has(id));
  if (strict && unknown.length > 0)
    throw new Error(`计划包含未知装备 ID：${unknown.join(", ")}。`);
  return sanitizePlan(
    {
      schemaVersion: PLAN_SCHEMA_VERSION,
      pendingIds: record.pendingIds as string[],
      completedIds: record.completedIds as string[],
      updatedAt:
        typeof record.updatedAt === "string" ? record.updatedAt : timestamp(),
    },
    knownIds,
  );
}

export function loadPlanState(
  storage: Storage | null,
  knownIds: Iterable<string>,
): PlanLoadResult {
  if (!storage)
    return {
      state: createEmptyPlan(),
      migrated: false,
      error: "当前环境没有可用的本地存储。",
    };
  const raw = storage.getItem(PLAN_STORAGE_KEY);
  if (!raw) return { state: createEmptyPlan(), migrated: false };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const known = new Set(knownIds);
    if (parsed.schemaVersion === 0 && Array.isArray(parsed.items)) {
      const migrated = createEmptyPlan();
      migrated.pendingIds = dedupeKnown(parsed.items, known);
      return { state: migrated, migrated: true };
    }
    return { state: parseState(parsed, known, false), migrated: false };
  } catch (error) {
    return {
      state: createEmptyPlan(),
      migrated: false,
      error: error instanceof Error ? error.message : "本地计划无法读取。",
    };
  }
}

export function savePlanState(storage: Storage | null, state: PlanState): void {
  storage?.setItem(PLAN_STORAGE_KEY, JSON.stringify(state));
}

export function exportPlan(state: PlanState): string {
  return JSON.stringify(
    {
      app: "HD2 军需簿",
      schemaVersion: PLAN_SCHEMA_VERSION,
      pendingIds: state.pendingIds,
      completedIds: state.completedIds,
      updatedAt: state.updatedAt,
      exportedAt: timestamp(),
    },
    null,
    2,
  );
}

export function importPlan(raw: string, knownIds: Iterable<string>): PlanState {
  return parseState(JSON.parse(raw) as unknown, new Set(knownIds), true);
}
