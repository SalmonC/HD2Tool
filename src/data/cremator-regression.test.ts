import { describe, expect, it } from "vitest";
import { catalogItems } from "./catalog";
import { searchEquipment } from "../lib/search";

describe("B/FLAM-80 Cremator release mapping", () => {
  it("keeps the official Chinese name, canonical English name and model as one production result", () => {
    const item = catalogItems.find(
      (entry) => entry.id === "b-flam-80-cremator",
    );
    expect(item).toBeDefined();
    expect(item?.nameZh).toBe("焚燃者");
    expect(item?.nameEn).toBe("B/FLAM-80 Cremator");
    expect(item?.model).toBe("B/FLAM-80");
    for (const query of ["焚燃者", "B/FLAM-80", "Cremator"]) {
      const results = searchEquipment(catalogItems, query);
      expect(results).toHaveLength(1);
      expect(results[0]?.item.id).toBe("b-flam-80-cremator");
    }
  });

  it("uses the structured Entrenched Division all-pages threshold", () => {
    const item = catalogItems.find(
      (entry) => entry.id === "b-flam-80-cremator",
    );
    expect(item?.acquisition.kind).toBe("warbond");
    if (item?.acquisition.kind !== "warbond") return;
    expect(item.acquisition.warbondId).toBe("entrenched-division");
    expect(item.acquisition.page).toBe(3);
    expect(item.acquisition.itemMedals).toBe(110);
    expect(item.acquisition.pageUnlockMedals).toBe(370);
  });
});
