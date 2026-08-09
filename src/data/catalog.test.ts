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
  weaponTypeLabel,
} from "../lib/display";
import { acquisitionAvailable } from "../lib/currency";

describe("light catalog", () => {
  it("keeps the accepted catalog and community aliases", () => {
    expect(catalogItems).toHaveLength(292);
    expect([...aliasesById.values()].flat()).toHaveLength(48);
    expect([...aliasesById.values()].flat()).not.toContain("(Armor)");
    expect(
      catalogItems.some((item) => item.image.path.includes("placeholder")),
    ).toBe(false);
    expect(catalog.meta.demolitionSource?.importedComponents).toBe(183);
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
