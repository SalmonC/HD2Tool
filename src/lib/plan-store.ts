import type { PlanLoadResult, PlanState } from "../types";
import { ID_ALIASES } from "../data/id-aliases";

export const PLAN_STORAGE_KEY = "hd2-supply-book:plan:v2";
export const LEGACY_PLAN_STORAGE_KEYS = ["hd2-supply-book:plan:v1"] as const;
export const PLAN_SCHEMA_VERSION = 2 as const;
export const PLAN_CAPACITY = 100;
export const PLAN_RECOVERY_KEY = "hd2-supply-book:plan:recovery:v1";
export const PLAN_RECOVERY_LIMIT = 12_000;

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

function dedupeKnown(
  ids: unknown,
  knownIds: Set<string>,
  limit = PLAN_CAPACITY,
): string[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => (typeof id === "string" ? (ID_ALIASES[id] ?? id) : id))
    .filter((id): id is string => typeof id === "string" && knownIds.has(id))
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, limit);
}

export function sanitizePlan(
  state: PlanState,
  knownIds: Iterable<string>,
): PlanState {
  const known = new Set(knownIds);
  const pendingIds = dedupeKnown(state.pendingIds, known, PLAN_CAPACITY);
  const completedIds = dedupeKnown(
    state.completedIds,
    known,
    PLAN_CAPACITY - pendingIds.length,
  ).filter((id) => !pendingIds.includes(id));
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
        next.completedIds.includes(action.id) ||
        next.pendingIds.length + next.completedIds.length >= PLAN_CAPACITY
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
        completedIds: [...next.completedIds, action.id].slice(0, PLAN_CAPACITY),
        updatedAt: timestamp(),
      };
    case "restore":
      if (
        !next.completedIds.includes(action.id) ||
        next.pendingIds.length + next.completedIds.length > PLAN_CAPACITY
      )
        return next;
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
      pendingIds.splice(
        Math.max(0, Math.min(action.toIndex, pendingIds.length)),
        0,
        action.id,
      );
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
  const schema = record.schemaVersion;
  if (schema !== PLAN_SCHEMA_VERSION && schema !== 1 && schema !== 0)
    throw new Error("不支持的计划 schema 版本。");
  if (schema === 0 && Array.isArray(record.items))
    return sanitizePlan(
      {
        ...createEmptyPlan(),
        pendingIds: record.items.filter(
          (id): id is string => typeof id === "string",
        ),
      },
      knownIds,
    );
  if (!Array.isArray(record.pendingIds) || !Array.isArray(record.completedIds))
    throw new Error("计划缺少 pendingIds 或 completedIds。");
  const allIds = [...record.pendingIds, ...record.completedIds].map((id) =>
    typeof id === "string" ? (ID_ALIASES[id] ?? id) : id,
  );
  if (!allIds.every((id) => typeof id === "string"))
    throw new Error("计划 ID 必须是字符串。");
  if (new Set(allIds).size !== allIds.length)
    throw new Error("计划中存在重复或同时待购/完成的 ID。");
  const unknown = allIds.filter((id) => !knownIds.has(id));
  if (strict && unknown.length > 0)
    throw new Error(`计划包含未知装备 ID：${unknown.join(", ")}`);
  return sanitizePlan(
    {
      schemaVersion: PLAN_SCHEMA_VERSION,
      pendingIds: (record.pendingIds as string[]).map(
        (id) => ID_ALIASES[id] ?? id,
      ),
      completedIds: (record.completedIds as string[]).map(
        (id) => ID_ALIASES[id] ?? id,
      ),
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
  const keys = [PLAN_STORAGE_KEY, ...LEGACY_PLAN_STORAGE_KEYS];
  const key = keys.find((candidate) => storage.getItem(candidate));
  if (!key) return { state: createEmptyPlan(), migrated: false };
  try {
    const known = new Set(knownIds);
    const rawValue = JSON.parse(storage.getItem(key) ?? "");
    const rawRecord =
      typeof rawValue === "object" && rawValue !== null
        ? (rawValue as Record<string, unknown>)
        : {};
    const rawIds: unknown[] = [
      ...(Array.isArray(rawRecord.pendingIds) ? rawRecord.pendingIds : []),
      ...(Array.isArray(rawRecord.completedIds) ? rawRecord.completedIds : []),
    ];
    const orphanedIds = [
      ...new Set(
        rawIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => ID_ALIASES[id] ?? id)
          .filter((id) => !known.has(id)),
      ),
    ];
    const state = parseState(rawValue, known, false);
    const migrated =
      key !== PLAN_STORAGE_KEY || state.schemaVersion !== PLAN_SCHEMA_VERSION;
    if (migrated) savePlanState(storage, state);
    return {
      state,
      migrated,
      ...(orphanedIds.length
        ? {
            orphanedIds,
            error: `计划中有 ${orphanedIds.length} 个 ID 已移除。`,
          }
        : {}),
    };
  } catch (error) {
    const raw = storage.getItem(key);
    if (raw) {
      try {
        storage.setItem(PLAN_RECOVERY_KEY, raw.slice(0, PLAN_RECOVERY_LIMIT));
      } catch {
        /* quota failure is reported below */
      }
    }
    storage.removeItem?.(key);
    return {
      state: createEmptyPlan(),
      migrated: false,
      error: `${error instanceof Error ? error.message : "本地计划无法读取。"} 已保留恢复副本。`,
    };
  }
}

export function savePlanState(storage: Storage | null, state: PlanState): void {
  if (!storage) return;
  storage.setItem(
    PLAN_STORAGE_KEY,
    JSON.stringify(
      sanitizePlan(state, [...state.pendingIds, ...state.completedIds]),
    ),
  );
  storage.removeItem?.(PLAN_RECOVERY_KEY);
  for (const legacyKey of LEGACY_PLAN_STORAGE_KEYS)
    storage.removeItem?.(legacyKey);
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
