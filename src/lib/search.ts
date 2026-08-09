import type { Equipment, GlossaryTerm } from "../types";
import { levenshteinDistance, normalizeSearchText } from "./normalize";

export type MatchKind =
  | "exact-model"
  | "exact-name"
  | "exact-english"
  | "exact-alias"
  | "prefix"
  | "contains"
  | "pinyin"
  | "fuzzy";

export interface SearchResult {
  item: Equipment;
  score: number;
  matchKind?: MatchKind;
  matchedAlias?: string;
}

export interface GlossarySearchResult {
  term: GlossaryTerm;
  matchedAlias?: string;
}

export function searchGlossary(
  terms: GlossaryTerm[],
  rawQuery: string,
): GlossarySearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const results: GlossarySearchResult[] = [];
  for (const term of terms) {
    const title = normalizeSearchText(term.titleZh);
    const matchedAlias = term.aliases.find((alias) =>
      normalizeSearchText(alias).includes(query),
    );
    const related = [term.description, ...term.examples].some((value) =>
      normalizeSearchText(value).includes(query),
    );
    if (title.includes(query) || matchedAlias || related)
      results.push({ term, matchedAlias });
  }
  return results;
}

interface Candidate {
  value: string;
  kind: MatchKind;
  alias?: string;
  order: number;
}

function candidateList(item: Equipment): Candidate[] {
  const candidates: Candidate[] = [
    { value: item.search.model, kind: "exact-model", order: 0 },
    { value: item.search.formalName, kind: "exact-name", order: 1 },
    { value: item.search.modelFormalName, kind: "exact-name", order: 2 },
    { value: item.search.englishName, kind: "exact-english", order: 3 },
  ];
  item.search.aliases.forEach((value, index) => {
    candidates.push({
      value,
      kind: "exact-alias",
      alias: item.aliases[index]?.text,
      order: 10 + index,
    });
  });
  item.search.pinyinFull.forEach((value, index) => {
    candidates.push({
      value,
      kind: "pinyin",
      alias: index > 0 ? item.aliases[index - 1]?.text : undefined,
      order: 30 + index,
    });
  });
  item.search.pinyinInitials.forEach((value, index) => {
    candidates.push({
      value,
      kind: "pinyin",
      alias: index > 0 ? item.aliases[index - 1]?.text : undefined,
      order: 40 + index,
    });
  });
  return candidates.filter((candidate) => candidate.value.length > 0);
}

function rankMatch(
  query: string,
  candidate: Candidate,
): { rank: number; distance: number } | undefined {
  if (candidate.value === query) {
    if (candidate.kind === "exact-model") return { rank: 1000, distance: 0 };
    if (candidate.kind === "exact-name" || candidate.kind === "exact-english")
      return { rank: 990, distance: 0 };
    if (candidate.kind === "exact-alias") return { rank: 900, distance: 0 };
    return { rank: 600, distance: 0 };
  }

  if (candidate.kind === "pinyin") {
    if (candidate.value.startsWith(query))
      return { rank: 600, distance: candidate.value.length - query.length };
    if (candidate.value.includes(query))
      return { rank: 590, distance: candidate.value.length - query.length };
  } else {
    if (candidate.value.startsWith(query))
      return { rank: 800, distance: candidate.value.length - query.length };
    if (candidate.value.includes(query))
      return { rank: 700, distance: candidate.value.length - query.length };
  }

  const distance = levenshteinDistance(query, candidate.value);
  const tolerance =
    query.length < 4 ? 1 : Math.min(2, Math.floor(query.length / 4));
  return distance <= tolerance
    ? { rank: candidate.kind === "pinyin" ? 450 : 500, distance }
    : undefined;
}

function compareResults(left: SearchResult, right: SearchResult): number {
  if (right.score !== left.score) return right.score - left.score;
  const nameOrder = left.item.nameZh.localeCompare(right.item.nameZh, "zh-CN");
  return nameOrder || left.item.id.localeCompare(right.item.id);
}

export function searchEquipment(
  items: Equipment[],
  rawQuery: string,
  limit = 50,
): SearchResult[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return items
      .slice()
      .sort(
        (left, right) =>
          left.nameZh.localeCompare(right.nameZh, "zh-CN") ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((item) => ({ item, score: 0 }));
  }

  const results: SearchResult[] = [];
  for (const item of items) {
    let best:
      { rank: number; distance: number; candidate: Candidate } | undefined;
    for (const candidate of candidateList(item)) {
      const match = rankMatch(query, candidate);
      if (!match) continue;
      if (
        !best ||
        match.rank > best.rank ||
        (match.rank === best.rank && match.distance < best.distance)
      ) {
        best = { ...match, candidate };
      }
    }
    if (!best) continue;
    results.push({
      item,
      score: best.rank * 100 - best.distance,
      matchKind: best.candidate.kind,
      matchedAlias: best.candidate.alias,
    });
  }
  const sorted = results.sort(compareResults);
  const strongest = sorted[0];
  if (strongest && strongest.score >= 90000) {
    // An exact model/name/alias is an intentional lookup. Do not dilute it
    // with broader substring matches (for example "火喷" vs "泵动火喷").
    // Equal-rank exact matches remain visible so a real data collision fails
    // the release alias gate instead of being hidden by this rule.
    const strongestRank = Math.floor(strongest.score / 100);
    return sorted
      .filter((result) => Math.floor(result.score / 100) === strongestRank)
      .slice(0, limit);
  }
  return sorted.slice(0, limit);
}
