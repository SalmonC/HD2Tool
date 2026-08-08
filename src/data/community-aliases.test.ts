import { describe, expect, it } from "vitest";
import rawSource from "./source/xiaoheihe-community-aliases.json";
import { catalog, catalogItems } from "./catalog";
import { searchEquipment, searchGlossary } from "../lib/search";

describe("小黑盒社区称呼数据", () => {
  it("逐条保留帖子中的 38 个装备映射和 53 个称呼", () => {
    expect(rawSource.equipment).toHaveLength(38);
    const equipmentAliases = rawSource.equipment.flatMap(
      (item) => item.aliases,
    );
    const glossaryAliases = rawSource.glossaryTerms.flatMap(
      (term) => term.aliases,
    );
    expect(equipmentAliases).toHaveLength(48);
    expect(glossaryAliases).toHaveLength(5);
    expect(new Set([...equipmentAliases, ...glossaryAliases]).size).toBe(53);
  });

  it("每个装备外号都能命中唯一的预期条目", () => {
    for (const sourceItem of rawSource.equipment) {
      for (const alias of sourceItem.aliases) {
        const results = searchEquipment(catalogItems, alias);
        expect(results[0]?.item.id, alias).toBe(sourceItem.id);
        expect(results[0]?.matchedAlias, alias).toBe(alias);
      }
    }
  });

  it("型号与中文正式名连写可直接查询", () => {
    for (const sourceItem of rawSource.equipment.filter(
      (item) => item.model !== "—",
    )) {
      expect(
        searchEquipment(
          catalogItems,
          `${sourceItem.model}${sourceItem.nameZh}`,
        )[0]?.item.id,
      ).toBe(sourceItem.id);
    }
  });

  it("护甲属性俗称作为术语返回，不冒充单件护甲", () => {
    for (const sourceTerm of rawSource.glossaryTerms) {
      for (const alias of sourceTerm.aliases) {
        expect(searchGlossary(catalog.glossaryTerms, alias)[0]?.term.id).toBe(
          sourceTerm.id,
        );
        expect(searchEquipment(catalogItems, alias)).toHaveLength(0);
      }
    }
  });
});
