import { describe, expect, it } from "vitest";
import fixtures from "./source/release-golden-fixtures.json";
import { catalog, catalogItems } from "./catalog";
import { searchEquipment } from "../lib/search";

describe("release golden warbonds", () => {
  for (const warbondFixture of fixtures.warbonds) {
    it(`${warbondFixture.nameZh} keeps all seven core items formally searchable`, () => {
      const warbond = catalog.warbonds.find(
        (candidate) => candidate.id === warbondFixture.id,
      );
      expect(warbond?.nameZh).toBe(warbondFixture.nameZh);
      expect(warbondFixture.items).toHaveLength(7);

      for (const fixture of warbondFixture.items) {
        const item = catalogItems.find(
          (candidate) => candidate.id === fixture.id,
        );
        expect(item, fixture.id).toBeDefined();
        expect(item?.nameZh).toBe(fixture.nameZh);
        expect(item?.model).toBe(fixture.model);
        expect(item?.acquisition).toMatchObject({
          kind: "warbond",
          warbondId: warbondFixture.id,
          page: fixture.page,
          itemMedals: fixture.itemMedals,
          pageIncrementalMedals: fixture.incrementalMedals,
          pageUnlockMedals: fixture.cumulativeMedals,
        });
        expect(item?.image.status).toBe(fixture.imageStatus);
        expect(searchEquipment(catalogItems, fixture.nameZh)[0]?.item.id).toBe(
          fixture.id,
        );
        expect(searchEquipment(catalogItems, fixture.model)[0]?.item.id).toBe(
          fixture.id,
        );
      }
    });
  }
});
