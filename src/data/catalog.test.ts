import { describe, expect, it } from "vitest";
import { aliasesById, catalog, catalogItems, findEquipment } from "./catalog";
import { warbondPageUnlock } from "../lib/plan-totals";
import {
  apSummaries,
  armorPenetrationText,
  demolitionSummaries,
  deploymentTypeLabel,
  displayableCombatComponents,
  hasDisplayableCombatFields,
  passiveLabel,
  radiusText,
  weaponTypeLabel,
} from "../lib/display";
import { acquisitionAvailable } from "../lib/currency";

describe("light catalog", () => {
  it("keeps the accepted catalog and community aliases", () => {
    expect(catalogItems).toHaveLength(298);
    expect([...aliasesById.values()].flat()).toHaveLength(48);
    expect([...aliasesById.values()].flat()).not.toContain("(Armor)");
    expect(
      catalogItems.some((item) => item.image.path.includes("placeholder")),
    ).toBe(false);
    expect(catalog.meta.demolitionSource?.importedComponents).toBe(188);
  });

  it("includes the 1.007.000 warbond equipment and balance changes", () => {
    expect(
      catalog.warbonds.find(
        (entry) => entry.id === "castellans-creed-legendary",
      ),
    ).toMatchObject({
      superCredits: 1500,
      pages: [
        { page: 1, cumulativeMedals: 0 },
        { page: 2, cumulativeMedals: null },
        { page: 3, cumulativeMedals: 210 },
      ],
    });
    expect(findEquipment("r-40-k-hot-shot-marksman-rifle")).toMatchObject({
      productKind: "primary-weapon",
      acquisition: { page: 1, itemMedals: 35 },
      handling: { magazine: 12, spareMagazines: 7, recoil: 18.75 },
      combat: {
        components: [
          {
            fields: {
              standardDamage: 275,
              durableDamage: 40,
              armorPenetration: { value: 3 },
              demolitionForce: 10,
            },
          },
        ],
      },
    });
    expect(findEquipment("40-k-meltagun")).toMatchObject({
      productKind: "support-weapon",
      acquisition: { page: 3, itemMedals: 110 },
      deployment: { cooldownSeconds: 410 },
      combat: {
        components: [
          {
            fields: {
              standardDamage: 2600,
              durableDamage: 2600,
              armorPenetration: { value: 7 },
              demolitionForce: 30,
            },
          },
        ],
      },
    });
    expect(findEquipment("p-40-k-bolt-pistol")).toMatchObject({
      localization: { status: "community-reviewed" },
      acquisition: { page: 2, itemMedals: 50 },
      combat: {
        primaryComponentId: "20140-component-1",
        components: [
          {
            type: "projectile",
            fields: {
              standardDamage: 325,
              durableDamage: 115,
              armorPenetration: { value: 4 },
              demolitionForce: 20,
            },
          },
          {
            type: "explosion",
            fields: {
              standardDamage: 175,
              durableDamage: 175,
              armorPenetration: { value: 3 },
              demolitionForce: 10,
              innerRadius: 1,
              outerRadius: 3.5,
            },
          },
        ],
      },
    });
    expect(findEquipment("g-40-k-melta-mine")).toMatchObject({
      localization: { status: "community-reviewed" },
      alternateNames: ["G/40-K Meltamine"],
      acquisition: { page: 2, itemMedals: 50 },
      combat: {
        components: [
          {
            fields: {
              standardDamage: 2000,
              durableDamage: 2000,
              armorPenetration: { value: 7 },
              demolitionForce: 40,
              innerRadius: 2.5,
              outerRadius: 6,
            },
          },
        ],
      },
    });
    for (const [id, armorClass, rating] of [
      ["tg-8-sharpshooter", "Medium", 100],
      ["tg-122-demo-trooper", "Heavy", 150],
    ] as const)
      expect(findEquipment(id)).toMatchObject({
        localization: { status: "community-reviewed" },
        armor: { class: armorClass, rating, passive: "True Grit" },
      });
    expect(findEquipment("p-113-verdict")?.handling?.spareMagazines).toBe(10);
    expect(findEquipment("m6c-socom-pistol")?.handling?.spareMagazines).toBe(
      10,
    );
    expect(findEquipment("p-19-redeemer")?.handling?.spareMagazines).toBe(6);
    expect(
      findEquipment("md-17-anti-tank-mines")?.combat?.components[0]?.fields
        .demolitionForce,
    ).toBe(40);
  });

  it("formats sourced attack radii without inventing a missing bound", () => {
    expect(radiusText({ innerRadius: 1, outerRadius: 3.5 })).toBe("1–3.5 米");
    expect(radiusText({ outerRadius: 6 })).toBe("外半径 6 米");
    expect(radiusText({ innerRadius: 2.5 })).toBe("内半径 2.5 米");
  });

  it("keeps high-risk identities and classifications distinct", () => {
    expect(findEquipment("mg-43-machine-gun")?.productKind).toBe(
      "support-weapon",
    );
    expect(findEquipment("cqc-72-entrenchment-tool")?.productKind).toBe(
      "support-weapon",
    );
    expect(findEquipment("cqc-73-entrenchment-tool")?.productKind).toBe(
      "secondary-weapon",
    );
    expect(findEquipment("gp-20-ultimatum")?.id).not.toBe(
      findEquipment("gp-31-grenade-pistol")?.id,
    );
  });

  it("derives non-first-page warbond thresholds from the registry", () => {
    const item = findEquipment("sg-451-cookout");
    expect(item?.acquisition.kind).toBe("warbond");
    if (item?.acquisition.kind !== "warbond") return;
    expect(
      warbondPageUnlock(
        catalog,
        item.acquisition.warbondId,
        item.acquisition.page,
      ),
    ).toBeTypeOf("number");
  });

  it("translates every currently known weapon type and armor passive", () => {
    for (const item of catalogItems) {
      if (item.weaponType)
        expect(weaponTypeLabel(item.weaponType)).not.toBe(item.weaponType);
      if (item.armor?.passive)
        expect(passiveLabel(item.armor.passive)).not.toBe(item.armor.passive);
      if (item.deployment?.type)
        expect(deploymentTypeLabel(item.deployment.type)).not.toBe(
          item.deployment.type,
        );
    }
  });

  it("does not add already unlocked or unavailable equipment to the plan", () => {
    expect(acquisitionAvailable(findEquipment("mg-43-machine-gun")!)).toBe(
      false,
    );
    expect(acquisitionAvailable(findEquipment("tr-62-knight")!)).toBe(false);
    expect(acquisitionAvailable(findEquipment("sg-451-cookout")!)).toBe(true);
  });

  it("keeps demolition values attached to their verified components", () => {
    const adjudicator = findEquipment("br-14-adjudicator");
    expect(adjudicator?.combat?.components[0]?.fields.demolitionForce).toBe(10);

    const oneTwo = findEquipment("ar-gl-21-one-two");
    expect(
      oneTwo?.combat?.components.map((component) => ({
        type: component.type,
        demolition: component.fields.demolitionForce,
      })),
    ).toEqual([
      { type: "projectile", demolition: 10 },
      { type: "projectile", demolition: undefined },
      { type: "explosion", demolition: 30 },
    ]);

    expect(
      findEquipment("g-23-stun")?.combat?.components[0]?.fields.demolitionForce,
    ).toBe(0);
  });

  it("restores explicitly sourced stratagem combat data", () => {
    const auditedComponentCounts: Record<string, number> = {
      "b-100-portable-hellbomb": 1,
      "eagle-110mm-rocket-pods": 2,
      "eagle-500kg-bomb": 3,
      "eagle-airstrike": 2,
      "eagle-cluster-bomb": 4,
      "eagle-napalm-airstrike": 2,
      "eagle-smoke-strike": 1,
      "eagle-strafing-run": 2,
      "exo-45-patriot-exosuit": 3,
      "exo-49-emancipator-exosuit": 2,
      "exo-51-lumberer-exosuit": 3,
      "m-102-fast-recon-vehicle": 1,
      "m-103-supply-frv": 1,
      "m-104-incinerator-frv": 1,
      "md-17-anti-tank-mines": 1,
      "md-6-anti-personnel-minefield": 1,
      "md-8-gas-mines": 1,
      "md-i4-incendiary-mines": 1,
      "orbital-120mm-he-barrage": 2,
      "orbital-380mm-he-barrage": 2,
      "orbital-airburst-strike": 4,
      "orbital-ems-strike": 2,
      "orbital-gas-strike": 2,
      "orbital-gatling-barrage": 3,
      "orbital-laser": 1,
      "orbital-napalm-barrage": 2,
      "orbital-precision-strike": 2,
      "orbital-railcannon-strike": 2,
      "orbital-smoke-strike": 1,
      "orbital-walking-barrage": 2,
      "td-220-bastion-mk-xvi": 3,
    };
    for (const [id, count] of Object.entries(auditedComponentCounts))
      expect(findEquipment(id)?.combat?.components).toHaveLength(count);

    const hellbomb = findEquipment("b-100-portable-hellbomb");
    expect(hellbomb?.combat?.components).toEqual([
      {
        id: "10361-component-1",
        type: "explosion",
        label: "Explosion",
        fields: {
          standardDamage: 10000,
          durableDamage: 10000,
          armorPenetration: { value: 10, labelZh: "反坦克 VI" },
          demolitionForce: 60,
          stagger: 50,
          push: 100,
        },
      },
    ]);
    expect(
      findEquipment("eagle-500kg-bomb")?.combat?.components.map(
        (component) => component.fields.demolitionForce,
      ),
    ).toEqual([50, 50, 40]);
    expect(
      findEquipment("eagle-cluster-bomb")?.combat?.components.map(
        (component) => component.fields.demolitionForce,
      ),
    ).toEqual([40, 30, 10, 30]);
    expect(
      findEquipment("orbital-ems-strike")?.combat?.components[1]?.fields,
    ).toMatchObject({
      standardDamage: 0,
      armorPenetration: { value: 6 },
      demolitionForce: 30,
    });
    expect(
      findEquipment("orbital-gas-strike")?.combat?.components[1]?.fields,
    ).toMatchObject({
      standardDamage: 0,
      armorPenetration: { value: 6 },
      demolitionForce: 50,
    });
    expect(
      findEquipment("exo-45-patriot-exosuit")?.combat?.components.map(
        (component) => component.fields.demolitionForce,
      ),
    ).toEqual([10, 30, 30]);
    expect(
      findEquipment("m-102-fast-recon-vehicle")?.combat?.components[0]?.fields
        .demolitionForce,
    ).toBe(15);
  });

  it("only treats actual combat facts as displayable", () => {
    expect(
      hasDisplayableCombatFields({
        id: "zero",
        type: "explosion",
        label: "Explosion",
        fields: { demolitionForce: 0 },
      }),
    ).toBe(true);
    expect(
      hasDisplayableCombatFields({
        id: "empty",
        type: "other",
        label: "Other",
        fields: {},
      }),
    ).toBe(false);
    expect(
      armorPenetrationText({
        id: "ap",
        type: "projectile",
        label: "Ballistic",
        fields: { armorPenetration: { value: 3, labelZh: "中型" } },
      }),
    ).toBe("3 · 中型");

    const gatling = findEquipment("orbital-gatling-barrage")!;
    expect(gatling.combat?.components).toHaveLength(3);
    expect(displayableCombatComponents(gatling)).toHaveLength(2);
    expect(apSummaries(gatling)).toHaveLength(2);
    expect(demolitionSummaries(gatling)).toHaveLength(2);
  });
});
