import { describe, expect, it } from "vitest";
import { catalog, catalogItems as formalCatalogItems } from "../data/catalog";
import type { Equipment } from "../types";
import { searchEquipment } from "./search";

const catalogItems = formalCatalogItems.length
  ? formalCatalogItems
  : (catalog.quarantine ?? []);

function searchableItem(overrides: Partial<Equipment>): Equipment {
  const base = catalogItems[0];
  return {
    ...base,
    ...overrides,
    image: { ...base.image },
    aliases: overrides.aliases ?? [],
    search: overrides.search ?? {
      model: (overrides.model ?? base.model).toLocaleLowerCase(),
      modelFormalName:
        `${overrides.model ?? base.model}${overrides.nameZh ?? base.nameZh}`.toLocaleLowerCase(),
      formalName: (overrides.nameZh ?? base.nameZh).toLocaleLowerCase(),
      englishName: (overrides.nameEn ?? base.nameEn).toLocaleLowerCase(),
      aliases: (overrides.aliases ?? []).map((alias) =>
        alias.text.toLocaleLowerCase(),
      ),
      pinyinFull: [],
      pinyinInitials: [],
    },
  };
}

describe("searchEquipment", () => {
  it("supports formal name, model, alias, pinyin initials and a small typo", () => {
    expect(searchEquipment(catalogItems, "高燃“破裂者”")[0]?.item.id).toBe(
      "sg-225ie-breaker-incendiary",
    );
    expect(searchEquipment(catalogItems, "SG-225IE")[0]?.item.id).toBe(
      "sg-225ie-breaker-incendiary",
    );
    expect(
      searchEquipment(catalogItems, "SG-225IE高燃破裂者")[0]?.item.id,
    ).toBe("sg-225ie-breaker-incendiary");
    const aliasResult = searchEquipment(catalogItems, "火连喷")[0];
    expect(aliasResult?.item.id).toBe("sg-225ie-breaker-incendiary");
    expect(aliasResult?.matchedAlias).toBe("火连喷");
    expect(searchEquipment(catalogItems, "火连喷x")[0]?.item.id).toBe(
      "sg-225ie-breaker-incendiary",
    );
    expect(searchEquipment(catalogItems, "not-found")).toHaveLength(0);
  });

  it("keeps exact formal name ahead of an exact alias collision", () => {
    const formal = searchableItem({
      id: "formal",
      model: "MODEL-FORMAL",
      nameZh: "共享称呼",
      nameEn: "Formal",
      aliases: [],
    });
    const alias = searchableItem({
      id: "alias",
      model: "MODEL-ALIAS",
      nameZh: "另一条目",
      nameEn: "Other",
      aliases: [
        {
          text: "共享称呼",
          kind: "community",
          sourceRefs: [{ kind: "local-fixture", label: "test" }],
          reviewStatus: "pending",
        },
      ],
    });
    expect(searchEquipment([alias, formal], "共享称呼")[0]?.item.id).toBe(
      "formal",
    );
  });

  it("uses deterministic tie breaking for otherwise equal results", () => {
    const left = searchableItem({
      id: "a",
      model: "MODEL-A",
      nameZh: "同前缀甲",
      nameEn: "A",
      aliases: [],
    });
    const right = searchableItem({
      id: "b",
      model: "MODEL-B",
      nameZh: "同前缀乙",
      nameEn: "B",
      aliases: [],
    });
    expect(
      searchEquipment([right, left], "同前缀").map((result) => result.item.id),
    ).toEqual(["a", "b"]);
  });
});
