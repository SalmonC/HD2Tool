import type { AmmoTrait, Catalog, Equipment } from "../types";

export interface WeaponFilters {
  weaponTypes: string[];
  ammoTraits: AmmoTrait[];
  armorPenetration: number | null;
  demolitionPower: number | null;
}

export function emptyWeaponFilters(): WeaponFilters {
  return {
    weaponTypes: [],
    ammoTraits: [],
    armorPenetration: null,
    demolitionPower: null,
  };
}

function verifiedProfile(item: Equipment) {
  return item.category === "weapon" ? item.weaponProfile : undefined;
}

function isVerifiedDimension(
  catalog: Catalog,
  id: "weaponType" | "ammoTraits" | "armorPenetration" | "demolitionPower",
) {
  const dimension = catalog.taxonomy.dimensions[id];
  return dimension?.verificationStatus === "verified" ? dimension : undefined;
}

function fieldUsesDimension(
  field: {
    taxonomySource: string;
    scaleVersion: string;
    verificationStatus: "verified" | "pending";
  },
  dimension: { taxonomySource: string; scaleVersion: string },
): boolean {
  return (
    field.verificationStatus === "verified" &&
    field.taxonomySource === dimension.taxonomySource &&
    field.scaleVersion === dimension.scaleVersion
  );
}

export function getWeaponTypeOptions(
  catalog: Catalog,
): Array<{ value: string; labelZh: string; count: number }> {
  const dimension = isVerifiedDimension(catalog, "weaponType");
  if (!dimension) return [];
  const counts = new Map<string, { labelZh: string; count: number }>();
  catalog.items.forEach((item) => {
    const field = verifiedProfile(item)?.weaponType;
    if (!field || !fieldUsesDimension(field, dimension)) return;
    const option = dimension.options.find(
      (entry) =>
        entry.id === field.value && entry.verificationStatus === "verified",
    );
    if (!option) return;
    const key = option.id;
    const current = counts.get(key);
    counts.set(key, {
      labelZh: current?.labelZh ?? option.labelZh,
      count: (current?.count ?? 0) + 1,
    });
  });
  return [...counts.entries()]
    .sort(([, left], [, right]) =>
      left.labelZh.localeCompare(right.labelZh, "zh-CN"),
    )
    .map(([value, { labelZh, count }]) => ({ value, labelZh, count }));
}

export function getAmmoTraitOptions(
  catalog: Catalog,
): Array<{ value: AmmoTrait; labelZh: string; count: number }> {
  const dimension = isVerifiedDimension(catalog, "ammoTraits");
  if (!dimension) return [];
  const counts = new Map<AmmoTrait, number>();
  catalog.items.forEach((item) => {
    const field = verifiedProfile(item)?.ammoTraits;
    if (!field || !fieldUsesDimension(field, dimension)) return;
    for (const trait of new Set(field.value))
      counts.set(trait, (counts.get(trait) ?? 0) + 1);
  });
  return dimension.options
    .filter(
      (option) =>
        option.verificationStatus === "verified" && counts.has(option.id),
    )
    .map((option) => ({
      value: option.id,
      labelZh: option.labelZh,
      count: counts.get(option.id) ?? 0,
    }));
}

function getNumericOptions(
  catalog: Catalog,
  id: "armorPenetration" | "demolitionPower",
): Array<{ value: number; count: number }> {
  const dimension = isVerifiedDimension(catalog, id);
  if (!dimension || !dimension.numberScale) return [];
  const counts = new Map<number, number>();
  catalog.items.forEach((item) => {
    const field = verifiedProfile(item)?.[id];
    if (!field || !fieldUsesDimension(field, dimension)) return;
    counts.set(field.value, (counts.get(field.value) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ value, count }));
}

export function getArmorPenetrationOptions(
  catalog: Catalog,
): Array<{ value: number; count: number }> {
  return getNumericOptions(catalog, "armorPenetration");
}

export function getDemolitionPowerOptions(
  catalog: Catalog,
): Array<{ value: number; count: number }> {
  return getNumericOptions(catalog, "demolitionPower");
}

export function matchesWeaponFilters(
  item: Equipment,
  filters: WeaponFilters,
  catalog: Catalog,
): boolean {
  const hasFilters =
    filters.weaponTypes.length > 0 ||
    filters.ammoTraits.length > 0 ||
    filters.armorPenetration !== null ||
    filters.demolitionPower !== null;
  if (!hasFilters) return true;
  const profile = verifiedProfile(item);
  if (!profile) return false;

  const typeDimension = isVerifiedDimension(catalog, "weaponType");
  const ammoDimension = isVerifiedDimension(catalog, "ammoTraits");
  const penetrationDimension = isVerifiedDimension(catalog, "armorPenetration");
  const demolitionDimension = isVerifiedDimension(catalog, "demolitionPower");
  if (
    filters.weaponTypes.length > 0 &&
    (!typeDimension ||
      !profile.weaponType ||
      !fieldUsesDimension(profile.weaponType, typeDimension) ||
      !filters.weaponTypes.includes(profile.weaponType.value))
  )
    return false;
  const ammoField = profile.ammoTraits;
  if (
    filters.ammoTraits.length > 0 &&
    (!ammoDimension ||
      !ammoField ||
      !fieldUsesDimension(ammoField, ammoDimension) ||
      !filters.ammoTraits.every((trait) => ammoField.value.includes(trait)))
  )
    return false;
  if (
    filters.armorPenetration !== null &&
    (!penetrationDimension ||
      !profile.armorPenetration ||
      !fieldUsesDimension(profile.armorPenetration, penetrationDimension) ||
      profile.armorPenetration.value !== filters.armorPenetration)
  )
    return false;
  if (
    filters.demolitionPower !== null &&
    (!demolitionDimension ||
      !profile.demolitionPower ||
      !fieldUsesDimension(profile.demolitionPower, demolitionDimension) ||
      profile.demolitionPower.value !== filters.demolitionPower)
  )
    return false;
  return true;
}

export function filterEquipmentByWeaponFilters(
  items: Equipment[],
  filters: WeaponFilters,
  catalog: Catalog,
): Equipment[] {
  return items.filter((item) => matchesWeaponFilters(item, filters, catalog));
}
