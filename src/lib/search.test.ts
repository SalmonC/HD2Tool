import { describe, expect, it } from "vitest";
import { catalogItems } from "../data/catalog";
import { searchEquipment } from "./search";

describe("searchEquipment", () => {
  it("finds model, Chinese name, English name and community aliases", () => {
    expect(searchEquipment(catalogItems, "SG-225IE")[0]?.item.id).toBe(
      "sg-225ie-breaker-incendiary",
    );
    expect(searchEquipment(catalogItems, "火喷")[0]?.item.id).toBe(
      "sg-225ie-breaker-incendiary",
    );
    expect(
      searchEquipment(catalogItems, "Breaker Incendiary")[0]?.item.id,
    ).toBe("sg-225ie-breaker-incendiary");
  });

  it("does not use pinyin or edit-distance fuzzy matching", () => {
    expect(searchEquipment(catalogItems, "huopen")).toHaveLength(0);
    expect(searchEquipment(catalogItems, "SG-225IF")).toHaveLength(0);
  });

  it("filters the full catalog before the UI paginates", () => {
    const armor = searchEquipment(catalogItems, "", "armor");
    expect(armor.length).toBe(105);
    expect(
      armor.every((result) => result.item.productKind === "body-armor"),
    ).toBe(true);
  });

  it("returns the complete catalog for the All category", () => {
    expect(searchEquipment(catalogItems, "", null)).toHaveLength(292);
  });
});
