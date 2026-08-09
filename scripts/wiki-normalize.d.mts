export interface WikiPageFixture {
  title: string;
  pageid: number;
  revid: number;
  url?: string;
  categories?: string[];
  wikitext: string;
}

export interface WarbondContentsEntry {
  canonicalTitle: string;
  itemMedals: number | null;
  name?: string;
  type: string;
  typeAmbiguous?: boolean;
  source: string;
}

export interface WarbondContents {
  warbondId: string;
  canonicalTitle: string;
  pages: Array<{
    page: number;
    spentToUnlock: number | null;
    entries: WarbondContentsEntry[];
    ambiguityCount?: number;
  }>;
}

export interface NormalizeEquipmentContext {
  capturedAt: string;
  attackTaxonomy: Record<string, unknown>;
  warbondThresholds: Record<string, Record<string, number | null>>;
  warbondThresholdSources: Record<string, unknown>;
  warbondContentsById: Map<string, WarbondContents>;
  imagesByTitle?: Record<string, unknown>;
}

export interface NormalizedEquipment {
  id: string;
  canonicalTitle: string;
  nameEn: string;
  aliases?: Array<Record<string, unknown>>;
  model: string | null;
  category: string;
  slot: string;
  infobox: string;
  sourceRefs: Array<Record<string, unknown>>;
  rawFields: Record<string, string>;
  acquisition: Record<string, unknown> | null;
  attackProfile: unknown;
  handlingStats: unknown;
  imageFileTitle?: string;
  image?: unknown;
  wikiLastUpdated: string | null;
  potentiallyOutdated: boolean;
}

export function parseWarbondContents(
  page: WikiPageFixture,
  capturedAt: string,
): WarbondContents;

export function selectWarbondContentsEntry(
  item: {
    canonicalTitle: string;
    category: string;
    acquisition?: { warbondId?: string };
  },
  contentsByWarbondId: Map<string, WarbondContents>,
): (WarbondContentsEntry & { warbondId: string; page: number }) | null;

export function normalizeEquipmentPage(
  page: WikiPageFixture,
  context: NormalizeEquipmentContext,
): NormalizedEquipment | null;
