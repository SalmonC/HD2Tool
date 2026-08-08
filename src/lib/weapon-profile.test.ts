import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import type { Catalog, SourceRef } from "../types";
import { validateCatalog } from "./data-validator";
import {
  emptyWeaponFilters,
  filterEquipmentByWeaponFilters,
  getAmmoTraitOptions,
  getDemolitionPowerOptions,
  getWeaponTypeOptions,
} from "./weapon-filters";

const source: SourceRef = { kind: "official", label: "测试用可信来源" };

function taxonomyFixture(): Catalog["taxonomy"] {
  return {
    version: "test-taxonomy-v2",
    dimensions: {
      weaponType: {
        id: "weaponType",
        labelZh: "武器类型",
        valueKind: "single",
        taxonomySource: "official-test",
        scaleVersion: "type-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
        options: [
          {
            id: "shotgun",
            labelZh: "分类甲",
            sourceRefs: [source],
            verificationStatus: "verified",
          },
          {
            id: "rifle",
            labelZh: "分类乙",
            sourceRefs: [source],
            verificationStatus: "verified",
          },
        ],
      },
      ammoTraits: {
        id: "ammoTraits",
        labelZh: "介质标签",
        valueKind: "multi",
        taxonomySource: "wiki-test",
        scaleVersion: "ammo-v4",
        sourceRefs: [source],
        verificationStatus: "verified",
        options: [
          {
            id: "kinetic",
            labelZh: "介质甲",
            sourceRefs: [source],
            verificationStatus: "verified",
          },
          {
            id: "thermal",
            labelZh: "介质乙",
            sourceRefs: [source],
            verificationStatus: "verified",
          },
        ],
      },
      armorPenetration: {
        id: "armorPenetration",
        labelZh: "穿甲值",
        valueKind: "number",
        taxonomySource: "official-test",
        scaleVersion: "ap-v3",
        sourceRefs: [source],
        verificationStatus: "verified",
        options: [],
        numberScale: { min: 1, max: 10, step: 1 },
      },
      demolitionPower: {
        id: "demolitionPower",
        labelZh: "拆毁值",
        valueKind: "number",
        taxonomySource: "official-test",
        scaleVersion: "demo-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
        options: [],
        numberScale: { min: 0, max: 50, step: 1 },
      },
    },
  };
}

function fixtureCatalog(): Catalog {
  const base = structuredClone(catalog) as Catalog;
  base.taxonomy = taxonomyFixture();
  base.items = base.items.slice(0, 1).map((item) => ({
    ...item,
    category: "weapon",
    weaponProfile: {
      weaponType: {
        value: "shotgun",
        taxonomySource: "official-test",
        scaleVersion: "type-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      ammoTraits: {
        value: ["kinetic", "thermal"],
        taxonomySource: "wiki-test",
        scaleVersion: "ammo-v4",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      armorPenetration: {
        value: 1,
        taxonomySource: "official-test",
        scaleVersion: "ap-v3",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      demolitionPower: {
        value: 0,
        taxonomySource: "official-test",
        scaleVersion: "demo-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
    },
  }));
  base.items.push({
    ...base.items[0],
    id: "weapon-b",
    model: "B",
    nameZh: "武器乙",
    aliases: [],
    weaponProfile: {
      weaponType: {
        value: "shotgun",
        taxonomySource: "official-test",
        scaleVersion: "type-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      ammoTraits: {
        value: ["kinetic"],
        taxonomySource: "wiki-test",
        scaleVersion: "ammo-v4",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      armorPenetration: {
        value: 10,
        taxonomySource: "official-test",
        scaleVersion: "ap-v3",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
      demolitionPower: {
        value: 50,
        taxonomySource: "official-test",
        scaleVersion: "demo-v1",
        sourceRefs: [source],
        verificationStatus: "verified",
      },
    },
  });
  base.items.push({
    ...base.items[0],
    id: "weapon-pending",
    model: "P",
    nameZh: "武器待核验",
    aliases: [],
    weaponProfile: {
      ammoTraits: {
        value: ["kinetic"],
        taxonomySource: "wiki-test",
        scaleVersion: "ammo-v4",
        sourceRefs: [source],
        verificationStatus: "pending",
      },
    },
  });
  base.items.push({
    ...base.items[0],
    id: "armor-with-profile",
    model: "A",
    nameZh: "护甲错误",
    category: "armor",
    aliases: [],
  });
  delete base.items[3].weaponProfile;
  return base;
}

describe("taxonomy-driven weapon profile validation", () => {
  it("accepts taxonomy-defined boundaries and rejects out-of-scale values", () => {
    const valid = validateCatalog(fixtureCatalog());
    expect(valid.ok).toBe(true);
    const invalid = fixtureCatalog();
    invalid.items[0].weaponProfile!.demolitionPower!.value = 51;
    expect(
      validateCatalog(invalid).issues.some(
        (entry) => entry.code === "taxonomy-number-out-of-scale",
      ),
    ).toBe(true);
    invalid.items[0].weaponProfile!.demolitionPower!.value = 0.5;
    expect(
      validateCatalog(invalid).issues.some(
        (entry) => entry.code === "demolition-power-out-of-contract",
      ),
    ).toBe(true);
    invalid.items[0].weaponProfile!.demolitionPower!.value = -1;
    expect(
      validateCatalog(invalid).issues.some(
        (entry) => entry.code === "taxonomy-number-out-of-scale",
      ),
    ).toBe(true);
  });

  it("rejects unknown verified taxonomy values but keeps them visible as pending", () => {
    const unknown = fixtureCatalog();
    unknown.items[0].weaponProfile!.ammoTraits!.value = ["explosive"];
    expect(validateCatalog(unknown).ok).toBe(false);
    unknown.items[0].weaponProfile!.ammoTraits!.verificationStatus = "pending";
    const pending = validateCatalog(unknown);
    expect(pending.ok).toBe(true);
    expect(
      pending.issues.some(
        (entry) => entry.code === "pending-unknown-taxonomy-value",
      ),
    ).toBe(true);
  });

  it("rejects non-weapons carrying a profile and ignores missing profile fields", () => {
    const invalid = fixtureCatalog();
    invalid.items[3].weaponProfile = invalid.items[0].weaponProfile;
    expect(
      validateCatalog(invalid).issues.some(
        (entry) => entry.code === "non-weapon-profile",
      ),
    ).toBe(true);
    const missing = fixtureCatalog();
    delete missing.items[0].weaponProfile!.demolitionPower;
    expect(validateCatalog(missing).ok).toBe(true);
  });
});

describe("acquisition discriminated union", () => {
  it("accepts edition, event and other records only with their required labels", () => {
    for (const acquisition of [
      {
        kind: "edition",
        editionName: "样例版本",
        price: null,
        status: "pending",
      },
      { kind: "event", eventName: "样例活动", status: "pending" },
      { kind: "other", label: "样例来源", status: "pending" },
    ]) {
      const data = structuredClone(catalog) as Catalog;
      data.items[0].acquisition = acquisition as never;
      expect(validateCatalog(data).ok).toBe(true);
    }
    const invalid = structuredClone(catalog) as Catalog;
    invalid.items[0].acquisition = {
      kind: "event",
      status: "pending",
    } as never;
    expect(
      validateCatalog(invalid).issues.some(
        (entry) => entry.code === "invalid-event",
      ),
    ).toBe(true);
  });
});

describe("taxonomy-driven weapon filters", () => {
  it("only exposes verified taxonomy values and combines fields deterministically", () => {
    const data = fixtureCatalog();
    const firstItemId = data.items[0].id;
    expect(getWeaponTypeOptions(data).map((option) => option.value)).toEqual([
      "shotgun",
    ]);
    expect(getAmmoTraitOptions(data).map((option) => option.value)).toEqual([
      "kinetic",
      "thermal",
    ]);
    expect(
      getDemolitionPowerOptions(data).map((option) => option.value),
    ).toEqual([0, 50]);
    const filters = {
      ...emptyWeaponFilters(),
      weaponTypes: ["shotgun"],
      ammoTraits: ["kinetic", "thermal"],
      armorPenetration: 1,
      demolitionPower: 0,
    };
    expect(
      filterEquipmentByWeaponFilters(data.items, filters, data).map(
        (item) => item.id,
      ),
    ).toEqual([firstItemId]);
    expect(
      filterEquipmentByWeaponFilters(
        data.items,
        { ...emptyWeaponFilters(), ammoTraits: ["thermal"] },
        data,
      ).map((item) => item.id),
    ).toEqual([firstItemId]);
    expect(
      filterEquipmentByWeaponFilters(
        data.items,
        { ...emptyWeaponFilters(), demolitionPower: 50 },
        data,
      ).map((item) => item.id),
    ).toEqual(["weapon-b"]);
  });

  it("does not classify pending or missing fields as verified filter matches", () => {
    const data = fixtureCatalog();
    const firstItemId = data.items[0].id;
    expect(
      filterEquipmentByWeaponFilters(
        data.items,
        { ...emptyWeaponFilters(), ammoTraits: ["kinetic"] },
        data,
      ).map((item) => item.id),
    ).toEqual([firstItemId, "weapon-b"]);
    expect(
      filterEquipmentByWeaponFilters(
        data.items,
        { ...emptyWeaponFilters(), armorPenetration: 10 },
        data,
      ).map((item) => item.id),
    ).toEqual(["weapon-b"]);
    data.items[1].weaponProfile!.demolitionPower!.verificationStatus =
      "pending";
    expect(
      filterEquipmentByWeaponFilters(
        data.items,
        { ...emptyWeaponFilters(), demolitionPower: 50 },
        data,
      ).map((item) => item.id),
    ).toEqual([]);
  });
});
