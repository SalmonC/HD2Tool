import { describe, expect, it } from "vitest";
import { aliasesById, catalog, catalogItems, findEquipment } from "./catalog";
import { warbondPageUnlock } from "../lib/plan-totals";
import {
  deploymentTypeLabel,
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
    expect(catalog.meta.demolitionSource?.importedComponents).toBe(123);
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
});
