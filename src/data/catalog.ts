import rawCatalog from "./catalog-runtime.json";
import type { Catalog } from "../types";

export const catalog = rawCatalog as unknown as Catalog;
export const catalogItems = catalog.items;

export function findEquipment(
  id: string,
): Catalog["items"][number] | undefined {
  return catalogItems.find((item) => item.id === id);
}
