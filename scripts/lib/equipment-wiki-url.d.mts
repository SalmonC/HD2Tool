export interface EquipmentWikiSource {
  nameEn: string;
  model: string;
  canonicalTitle?: string;
  sourceRefs: Array<{
    kind: string;
    label: string;
    url?: string;
    pageId?: number;
    revision?: number | string;
    oldid?: number;
  }>;
}

export function selectEquipmentWikiUrl(
  item: EquipmentWikiSource,
): string | null;
