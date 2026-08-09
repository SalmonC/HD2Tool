import { aliasesById } from "../data/catalog";
import type { BrowseCategory, Equipment, ProductKind } from "../types";
import { normalizeSearchText } from "./normalize";

export type MatchKind = "exact" | "prefix" | "contains";

export interface SearchResult {
  item: Equipment;
  score: number;
  matchKind?: MatchKind;
  matchedAlias?: string;
}

export function browseCategoryFor(kind: ProductKind): BrowseCategory {
  if (kind === "primary-weapon" || kind === "secondary-weapon") return "weapon";
  if (kind === "grenade") return "grenade";
  if (kind === "body-armor") return "armor";
  return "stratagem";
}

export function matchesCategory(
  item: Equipment,
  category: BrowseCategory | null,
): boolean {
  return category === null || browseCategoryFor(item.productKind) === category;
}

interface Candidate {
  value: string;
  priority: number;
  alias?: string;
}

function candidates(item: Equipment): Candidate[] {
  const values: Candidate[] = [
    { value: item.model ?? "", priority: 6 },
    { value: item.nameZh, priority: 5 },
    { value: item.nameEn, priority: 4 },
    ...(item.alternateNames ?? []).map((value) => ({ value, priority: 3 })),
    ...(aliasesById.get(item.id) ?? []).map((value) => ({
      value,
      priority: 4,
      alias: value,
    })),
  ];
  return values
    .map((candidate) => ({
      ...candidate,
      value: normalizeSearchText(candidate.value),
    }))
    .filter((candidate) => candidate.value.length > 0);
}

export function searchEquipment(
  items: Equipment[],
  rawQuery: string,
  category: BrowseCategory | null = null,
): SearchResult[] {
  const scoped = items.filter((item) => matchesCategory(item, category));
  const query = normalizeSearchText(rawQuery);
  if (!query)
    return scoped
      .slice()
      .sort(
        (left, right) =>
          left.nameZh.localeCompare(right.nameZh, "zh-CN") ||
          left.id.localeCompare(right.id),
      )
      .map((item) => ({ item, score: 0 }));

  const results: SearchResult[] = [];
  for (const item of scoped) {
    let best:
      | { score: number; matchKind: MatchKind; matchedAlias?: string }
      | undefined;
    for (const candidate of candidates(item)) {
      let matchKind: MatchKind | undefined;
      let rank = 0;
      if (candidate.value === query) {
        matchKind = "exact";
        rank = 3;
      } else if (candidate.value.startsWith(query)) {
        matchKind = "prefix";
        rank = 2;
      } else if (candidate.value.includes(query)) {
        matchKind = "contains";
        rank = 1;
      }
      if (!matchKind) continue;
      const score = rank * 100 + candidate.priority;
      if (!best || score > best.score)
        best = { score, matchKind, matchedAlias: candidate.alias };
    }
    if (best) results.push({ item, ...best });
  }
  return results.sort(
    (left, right) =>
      right.score - left.score ||
      left.item.nameZh.localeCompare(right.item.nameZh, "zh-CN") ||
      left.item.id.localeCompare(right.item.id),
  );
}
