import { describe, expect, it } from "vitest";
import p0_2Translation from "./source/translation-p0-2.json";
import localization from "./source/official-localization.json";
import { catalogItems } from "./catalog";
import { searchEquipment } from "../lib/search";
import { normalizeSearchText } from "../lib/normalize";

const records = p0_2Translation.records;
const expectedIds = [
  "ar-61-tenderizer",
  "cqc-2-saber",
  "m7s-smg",
  "m90a-shotgun",
  "ma5c-assault-rifle",
  "mg-43-machine-gun",
  "smg-72-pummeler",
  "sta-11-smg",
  "sta-52-assault-rifle",
  "tx-41-sterilizer",
] as const;

const modelToken = (record: (typeof records)[number]) =>
  record.model || record.canonicalEnglish.match(/^[A-Z][A-Z0-9/-]*/)?.[0] || "";

const sourceById = new Map(
  p0_2Translation.sourceRegistry.map((source) => [source.id, source]),
);

const derivedMatchMode = (record: (typeof records)[number]) => {
  if (
    record.nameKey &&
    record.nameEnglishValue &&
    record.nameSimplifiedChineseValue
  ) {
    return "explicit-split-key-composition";
  }
  if (
    record.supportSourceIds.some((id) => {
      const source = sourceById.get(id);
      return (
        source?.level?.startsWith("official") &&
        typeof source?.locator === "string" &&
        typeof source?.excerpt === "string"
      );
    })
  ) {
    return "official-zh-hans-announcement";
  }
  return record.supportSourceIds.length >= 2
    ? "community-two-source"
    : "unresolved";
};

describe("P0-2b released Chinese evidence", () => {
  it("has one auditable decision per requested item", () => {
    expect(records.map((record) => record.canonicalId)).toEqual(expectedIds);
    for (const record of records) {
      expect(record.proposedNameZh, record.canonicalId).toBeTruthy();
      expect(record.candidateNames.length, record.canonicalId).toBe(
        record.candidateCount,
      );
      expect(
        record.supportSourceIds.length,
        record.canonicalId,
      ).toBeGreaterThan(0);
      expect(new Set(record.supportSourceIds).size, record.canonicalId).toBe(
        record.supportSourceIds.length,
      );
      expect(record.crosscheckSourceIds, record.canonicalId).toBeDefined();
      expect(
        record.supportSourceIds.some((id) =>
          (record.conflictSourceIds as readonly string[]).includes(id),
        ),
        record.canonicalId,
      ).toBe(false);
      for (const sourceId of [
        ...record.supportSourceIds,
        ...record.conflictSourceIds,
        ...record.crosscheckSourceIds,
      ]) {
        expect(
          sourceById.has(sourceId),
          `${record.canonicalId}:${sourceId}`,
        ).toBe(true);
        expect(sourceById.get(sourceId)?.evidenceOf).toContain(
          record.canonicalId,
        );
      }
      expect(record.conflictReason, record.canonicalId).toBeTruthy();
      expect(record.status).toBe(
        record.supportSourceIds.some((id) =>
          sourceById.get(id)?.level?.startsWith("official"),
        )
          ? "official"
          : "verified-community",
      );
      expect(record.matchMode, record.canonicalId).toBe(
        derivedMatchMode(record),
      );
    }
  });

  it("verifies split-key names against the exact local resource records", () => {
    const expected = new Map([
      ["ar-61-tenderizer", [2464525212, 2454588206, 3399333856, "肉锤"]],
      ["cqc-2-saber", [3291099282, 2666785586, 3476675802, "军刀"]],
      ["smg-72-pummeler", [1670510815, 208882811, 4107864567, "暴击斗士"]],
      ["tx-41-sterilizer", [3533820337, 926933616, 1223276667, "灭菌器"]],
    ]);
    for (const [id, [modelKey, nameKey, duplicateKey, zh]] of expected) {
      const record = records.find((candidate) => candidate.canonicalId === id);
      expect(record?.matchMode, id).toBe("explicit-split-key-composition");
      expect(record?.englishKey, id).toBe(modelKey);
      expect(record?.nameKey, id).toBe(nameKey);
      expect(record?.nameKeyCorroboration, id).toContain(duplicateKey);
      const modelRows = localization.records.filter(
        (candidate) => candidate.key === modelKey,
      );
      expect(modelRows, `${id}:model`).toHaveLength(1);
      expect(modelRows[0].english, `${id}:model`).toBe(record?.englishValue);
      expect(modelRows[0].simplifiedChinese, `${id}:model`).toBe(
        record?.simplifiedChineseValue,
      );
      for (const [index, key] of [nameKey, duplicateKey].entries()) {
        const rows = localization.records.filter(
          (candidate) => candidate.key === key,
        );
        expect(rows, `${id}:${key}`).toHaveLength(1);
        const corroboration = record?.nameEnglishValuesCorroboration ?? [];
        const expectedEnglish =
          index === 0 ? record?.nameEnglishValue : corroboration[index - 1];
        expect(rows[0].english, `${id}:${key}`).toBe(expectedEnglish);
        expect(rows[0].simplifiedChinese, `${id}:${key}`).toBe(zh);
        expect(rows[0].simplifiedChinese, `${id}:${key}`).toBe(
          record?.nameSimplifiedChineseValue,
        );
        expect(rows[0].englishSha256).toBe(
          "bce4468d52268fc8dbe3ba6a298cdab8c3e837fde0ffb6b2e0d5f7a9ea5b8aa5",
        );
        expect(rows[0].simplifiedSha256).toBe(
          "ae242b3899b2bb3dc36df89af572ab0be02e141a8be79558cc7bdf4bed2810b7",
        );
      }
    }
  });

  it("keeps source support and conflict semantics separate", () => {
    const smg = records.find(
      (record) => record.canonicalId === "smg-72-pummeler",
    );
    expect(smg?.proposedNameZh).toBe("暴击斗士");
    expect(smg?.supportSourceIds).toEqual([
      "p0-2-official-localization-equipment",
    ]);
    expect(smg?.conflictSourceIds).toEqual([
      "p0-2-17173-smg72-current",
      "p0-2-playstation-zh-hant-polar-patriots",
    ]);
    expect(smg?.supportSourceIds).not.toContain("p0-2-17173-smg72-current");
    expect(smg?.supportSourceIds).not.toContain(
      "p0-2-playstation-zh-hant-polar-patriots",
    );
    const ar = records.find(
      (record) => record.canonicalId === "ar-61-tenderizer",
    );
    expect(ar?.crosscheckSourceIds).toEqual([
      "p0-2-playstation-zh-hant-polar-patriots",
    ]);
    expect(ar?.conflictSourceIds).toEqual([]);
    const tx = records.find(
      (record) => record.canonicalId === "tx-41-sterilizer",
    );
    expect(tx?.supportSourceIds).not.toContain("p0-2-steam-zh-hans-tx41");
    expect(tx?.crosscheckSourceIds).toEqual(["p0-2-steam-zh-hans-tx41"]);
    const independentKeys = smg?.supportSourceIds.map(
      (id) => sourceById.get(id)?.independenceKey,
    );
    expect(new Set(independentKeys).size).toBe(independentKeys?.length);
    expect(
      sourceById.get("p0-2-playstation-zh-hant-polar-patriots")?.language,
    ).toBe("zh-Hant");
    expect(sourceById.get("p0-2-official-bilibili-5-0")).toMatchObject({
      language: "zh-Hans",
      publisher: "绝地潜兵官方",
      documentId: "BV1zr2eBLEHe",
      locator: "07:44；09:04",
      excerpt: "07:44 M7S冲锋枪；09:04 M90A霰弹枪",
    });
    expect(sourceById.get("p0-2-official-opus-ma5c")).toMatchObject({
      documentId: "1102831852292407303",
      url: "https://www.bilibili.com/opus/1102831852292407303",
      excerpt: "MA5C突击步枪",
    });
    expect(sourceById.get("p0-2-official-playstation-hk-sta")).toMatchObject({
      language: "zh-Hans-HK",
      publisher: "PlayStation 香港",
      excerpt: "StA-11冲锋枪；StA-52突击步枪",
    });
    expect(sourceById.get("p0-2-official-game-mg43")).toMatchObject({
      locator: "Items[].Key=2637750421",
      excerpt: "“MG-43机枪”战略配备可暂时供所有绝地潜兵使用。",
      sourceFileSha256:
        "a21d453e4ea99afe94e6cf386825706a6ef8bfe8467a8564ef0892104e3a2f02",
    });
  });

  it("rejects model-only, generic, tampered, or ambiguous candidates", () => {
    const genericNames = new Set([
      "手枪",
      "步枪",
      "冲锋枪",
      "机枪",
      "霰弹枪",
      "手枪",
    ]);
    for (const record of records) {
      expect(genericNames.has(record.proposedNameZh), record.canonicalId).toBe(
        false,
      );
      expect(normalizeSearchText(record.proposedNameZh)).not.toBe(
        normalizeSearchText(modelToken(record)),
      );
      expect(record.candidateCount).toBe(record.candidateNames.length);
    }
    const tampered = localization.records.find(
      (record) => record.key === 2454588206,
    );
    expect(tampered?.englishSha256).not.toBe("tampered");
    expect(tampered?.simplifiedChinese).toBe("肉锤");
    expect(
      records.find((record) => record.canonicalId === "ar-61-tenderizer")
        ?.candidateNames,
    ).toEqual(["肉锤"]);
  });

  it("makes every requested model and Chinese name an exact unique formal hit", () => {
    expect(
      Object.fromEntries(
        records.map((record) => [record.canonicalId, record.model]),
      ),
    ).toEqual({
      "ar-61-tenderizer": "AR-61",
      "cqc-2-saber": "CQC-2",
      "m7s-smg": "M7S",
      "m90a-shotgun": "M90A",
      "ma5c-assault-rifle": "MA5C",
      "mg-43-machine-gun": "MG-43",
      "smg-72-pummeler": "SMG-72",
      "sta-11-smg": "StA-11",
      "sta-52-assault-rifle": "StA-52",
      "tx-41-sterilizer": "TX-41",
    });
    for (const record of records) {
      const item = catalogItems.find(
        (candidate) => candidate.id === record.canonicalId,
      );
      expect(item, record.canonicalId).toBeDefined();
      expect(item?.nameZh, record.canonicalId).toBe(record.proposedNameZh);
      expect(
        searchEquipment(catalogItems, modelToken(record)).map(
          (result) => result.item.id,
        ),
      ).toEqual([record.canonicalId]);
      expect(
        searchEquipment(catalogItems, record.proposedNameZh).map(
          (result) => result.item.id,
        ),
      ).toEqual([record.canonicalId]);
    }
  });

  it("does not cross-wire StA-11, StA-52, CQC-2, or product scope", () => {
    expect(
      searchEquipment(catalogItems, "StA-11").map((result) => result.item.id),
    ).toEqual(["sta-11-smg"]);
    expect(
      searchEquipment(catalogItems, "StA-52").map((result) => result.item.id),
    ).toEqual(["sta-52-assault-rifle"]);
    expect(
      searchEquipment(catalogItems, "CQC-2").map((result) => result.item.id),
    ).toEqual(["cqc-2-saber"]);
    expect(catalogItems.some((item) => item.category === "booster")).toBe(
      false,
    );
  });
});
