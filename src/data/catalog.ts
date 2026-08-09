import rawCatalog from "./catalog.json";
import rawAliases from "./community-aliases.json";
import type { Catalog, CommunityAliases, Equipment } from "../types";

export const catalog = rawCatalog as Catalog;
export const communityAliases = rawAliases as CommunityAliases;
export const catalogItems = catalog.items;

export const itemsById = new Map(
  catalogItems.map((item) => [item.id, item] as const),
);
export const aliasesById = new Map(
  communityAliases.entries.map(
    (entry) => [entry.equipmentId, entry.aliases] as const,
  ),
);

export function findEquipment(id: string): Equipment | undefined {
  return itemsById.get(catalog.idAliases[id] ?? id);
}
