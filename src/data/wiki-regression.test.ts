import normalized from "./source/wiki-normalized.json";
import { describe, expect, it } from "vitest";
import { catalogItems } from "./catalog";

type NormalizedItem = (typeof normalized.items)[number];

function itemByTitle(title: string): NormalizedItem {
  const found = normalized.items.find(
    (entry) => entry.canonicalTitle === title,
  );
  if (!found)
    throw new Error(`Missing normalized regression fixture: ${title}`);
  return found;
}

describe("Wiki normalization golden cases", () => {
  it("normalizes Wiki-discovered B/FLAM-80 Cremator instead of dropping it outside the community overlay", () => {
    const cremator = normalized.items.find(
      (entry) => entry.nameEn === "B/FLAM-80 Cremator",
    );
    expect(cremator).toBeDefined();
    expect(cremator?.id).toBe("b-flam-80-cremator");
    expect(cremator?.model).toBe("B/FLAM-80");
  });

  it("keeps projectile and explosion AP separate for FAF-14 Spear", () => {
    const components = (itemByTitle("FAF-14 Spear").attackProfile?.components ??
      []) as any[];
    expect(
      components.map((component) => component.fields.armorPenetration?.value),
    ).toEqual([7, 3]);
    expect(components[1]?.fields.magazine).toBeUndefined();
  });

  it("keeps projectile and explosion AP separate and handling on the projectile for WASP", () => {
    const components = (itemByTitle("StA-X3 W.A.S.P. Launcher").attackProfile
      ?.components ?? []) as any[];
    expect(
      components.map((component) => component.fields.armorPenetration?.value),
    ).toEqual([6, 3]);
    expect(components[1]?.fields.magazine).toBeUndefined();
    expect(components[1]?.fields.fireRate).toBeUndefined();
    expect(components[1]?.fields.dps).toBeUndefined();
  });

  it("does not copy weapon handling or AP to a Fire status component", () => {
    const components = (itemByTitle("SG-225IE Breaker Incendiary").attackProfile
      ?.components ?? []) as any[];
    const fire = components.find((component) => component.label === "Fire");
    expect(fire?.fields.armorPenetration).toBeUndefined();
    expect(fire?.fields.magazine).toBeUndefined();
    expect(fire?.fields.fireRate).toBeUndefined();
    expect(fire?.fields.recoil).toBeUndefined();
  });

  it("does not let a default parser result erase the known Freedom's Flame acquisition", () => {
    const acquisition = itemByTitle("SG-451 Cookout").acquisition!;
    expect(acquisition.kind).toBe("warbond");
    if (acquisition.kind !== "warbond") return;
    expect(acquisition.warbondId).toBe("freedoms-flame");
    expect(acquisition.page).toBe(1);
    expect(acquisition.itemMedals).toBe(20);
  });

  it("cleans Wiki template markers from the GL-52 weapon taxonomy", () => {
    const gl52 = catalogItems.find((item) => item.model === "GL-52");
    expect(gl52?.weaponProfile?.weaponType?.value).toBe("Stun Tesla");
    expect(gl52?.weaponProfile?.weaponType?.value).not.toContain("{{");
  });

  it("preserves an explicit zero damage field for non-damaging grenade AP admission", () => {
    const urchin = itemByTitle("G-109 Urchin");
    const component = urchin.attackProfile?.components[0] as
      | {
          fields?: {
            standardDamage?: number;
            armorPenetration?: { value?: number };
          };
        }
      | undefined;
    expect(component?.fields?.standardDamage).toBe(0);
    expect(component?.fields?.armorPenetration?.value).toBe(6);
  });
});
