import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { searchEquipment } from "../lib/search";
import officialLocalization from "./source/official-localization.json";
import goldenFixtures from "./source/release-golden-fixtures.json";
import warbondEvidence from "./source/warbond-translation-evidence.json";
import wiki from "./source/wiki-normalized.json";

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
const admittedCountForWarbond = (warbondId: string) =>
  catalog.coverage?.warbondContentsCoverage?.find(
    (entry) => entry.warbondId === warbondId,
  )?.admittedCount ?? -1;

describe("warbond translation and visible-text regressions", () => {
  it("gives every Wiki warbond an evidenced non-empty Chinese name", () => {
    expect(wiki.warbonds).toHaveLength(24);
    expect(warbondEvidence.records).toHaveLength(24);
    const evidenceById = new Map(
      warbondEvidence.records.map((record) => [record.canonicalId, record]),
    );
    const generatedById = new Map(
      catalog.warbonds.map((warbond) => [warbond.id, warbond]),
    );

    for (const warbond of wiki.warbonds) {
      const evidence = evidenceById.get(warbond.id);
      expect(evidence?.canonicalEnglish, warbond.id).toBe(warbond.nameEn);
      expect(evidence?.nameZh.trim(), warbond.id).toBeTruthy();
      expect(generatedById.get(warbond.id)?.nameZh.trim(), warbond.id).toBe(
        evidence?.nameZh,
      );
    }
    expect(evidenceById.get("entrenched-division")?.nameZh).toBe("堑壕之师");
  });

  it("ties official warbond names to exact extracted Simplified Chinese keys", () => {
    const extractedByKey = new Map(
      officialLocalization.warbondRecords.map((record) => [
        record.key,
        record.simplifiedChinese,
      ]),
    );
    for (const record of warbondEvidence.records) {
      for (const key of record.officialLocalizationKeys) {
        expect(extractedByKey.get(key), `${record.canonicalId}:${key}`).toBe(
          record.nameZh,
        );
      }
    }
  });

  it("does not admit an item whose referenced warbond has no Chinese name", () => {
    const warbondNames = new Map(
      catalog.warbonds.map((warbond) => [warbond.id, warbond.nameZh.trim()]),
    );
    for (const item of catalog.items) {
      if (item.acquisition.kind === "warbond") {
        expect(
          warbondNames.get(item.acquisition.warbondId),
          item.id,
        ).toBeTruthy();
      }
    }
  });

  it("keeps both requested warbond pages complete at the name layer", () => {
    const allItems = [...catalog.items, ...(catalog.quarantine ?? [])];
    for (const [warbondId, expectedName] of [
      ["entrenched-division", "堑壕之师"],
      ["exo-experts", "外骨骼装甲专家"],
    ] as const) {
      expect(
        catalog.warbonds.find((entry) => entry.id === warbondId)?.nameZh,
      ).toBe(expectedName);
      expect(
        allItems.filter(
          (item) =>
            item.acquisition.kind === "warbond" &&
            item.acquisition.warbondId === warbondId,
        ),
      ).toHaveLength(admittedCountForWarbond(warbondId));
    }

    expect(
      allItems.find((item) => item.id === "p-33-missile-pistol"),
    ).toMatchObject({ nameEn: "P-33 Missile Pistol", nameZh: "制导手枪" });
    expect(
      allItems.find((item) => item.id === "cph-26-commandant"),
    ).toMatchObject({ nameEn: "CPH-26 Commandant", nameZh: "CPH-26“司令官”" });
  });

  it("admits every item on the two latest warbond golden pages", () => {
    const expected = new Map([
      [
        "entrenched-division",
        {
          nameZh: "堑壕之师",
          thresholds: { 1: 0, 2: 125, 3: 370 },
          ids: [
            "b-flam-80-cremator",
            "cpg-48-sapper",
            "p-69-veto",
            "smg-flam-34-stoker",
            "cph-26-commandant",
            "g-48-giga-grenade",
            "a-gm-17-gas-mortar-sentry",
          ],
        },
      ],
      [
        "exo-experts",
        {
          nameZh: "外骨骼装甲专家",
          thresholds: { 1: 0, 2: 165, 3: 220 },
          ids: [
            "exo-55-breakthrough-exosuit",
            "mgx-42-bullet-storm",
            "o-3-free-spirit",
            "smg-203-gallant",
            "exo-51-lumberer-exosuit",
            "o-2-heavy-operator",
            "p-33-missile-pistol",
          ],
        },
      ],
    ]);

    for (const [warbondId, fixture] of expected) {
      expect(
        catalog.warbonds.find((bond) => bond.id === warbondId)?.nameZh,
      ).toBe(fixture.nameZh);
      const items = catalog.items.filter(
        (item) =>
          item.acquisition.kind === "warbond" &&
          item.acquisition.warbondId === warbondId,
      );
      expect(items.length, warbondId).toBe(admittedCountForWarbond(warbondId));
      for (const item of items) {
        expect(item.acquisition.kind, item.id).toBe("warbond");
        if (item.acquisition.kind !== "warbond")
          throw new Error(`${item.id} is not a warbond acquisition`);
        expect(item.nameZh, item.id).toBeTruthy();
        expect(item.model, item.id).toBeTruthy();
        expect(item.category, item.id).toBeTruthy();
        expect(item.image.path, item.id).toBeTruthy();
        expect(item.acquisition.page, item.id).toEqual(expect.any(Number));
        expect(item.acquisition.itemMedals, item.id).toEqual(
          expect.any(Number),
        );
        const page = item.acquisition.page as 1 | 2 | 3;
        expect(item.acquisition.pageUnlockMedals, item.id).toBe(
          fixture.thresholds[page],
        );
        if (item.category === "weapon" || item.category === "grenade")
          expect(
            item.attackProfile?.components.length,
            item.id,
          ).toBeGreaterThan(0);
        if (item.category === "armor")
          expect(item.stats?.armor, item.id).toEqual(expect.any(Number));
      }
      expect(items.map((item) => item.id).sort(), `${warbondId} IDs`).toEqual(
        expect.arrayContaining(fixture.ids),
      );
    }
  });

  it("matches every release golden fixture field without assuming a page", () => {
    for (const fixture of goldenFixtures.warbonds) {
      expect(
        catalog.warbonds.find((bond) => bond.id === fixture.id)?.nameZh,
      ).toBe(fixture.nameZh);
      expect(fixture.items).toHaveLength(7);
      for (const expected of fixture.items) {
        const item = catalog.items.find((entry) => entry.id === expected.id);
        expect(item, expected.id).toBeDefined();
        if (!item) continue;
        expect(item.admissionStatus, expected.id).toBe("admitted");
        expect(item.nameZh, expected.id).toBe(expected.nameZh);
        expect(item.model, expected.id).toBe(expected.model);
        for (const query of [expected.nameZh, expected.model]) {
          expect(
            searchEquipment(catalog.items, query).some(
              (result) => result.item.id === expected.id,
            ),
            `${expected.id}:${query}`,
          ).toBe(true);
        }
        expect(item.image.status, expected.id).toBe(expected.imageStatus);
        expect(item.image.path, expected.id).toBeTruthy();
        expect(item.acquisition.kind, expected.id).toBe("warbond");
        if (item.acquisition.kind !== "warbond") continue;
        expect(item.acquisition.warbondId, expected.id).toBe(fixture.id);
        expect(item.acquisition.page, expected.id).toBe(expected.page);
        expect(item.acquisition.itemMedals, expected.id).toBe(
          expected.itemMedals,
        );
        expect(item.acquisition.pageUnlockMedals, expected.id).toBe(
          expected.cumulativeMedals,
        );
        if (item.category === "weapon" || item.category === "grenade")
          expect(
            item.attackProfile?.components.length,
            expected.id,
          ).toBeGreaterThan(0);
        if (item.category === "armor")
          expect(item.stats?.armor, expected.id).toEqual(expect.any(Number));
      }
    }
  });

  it("keeps GP-20 Ultimatum and GP-31 Grenade Pistol identities and aliases separate", () => {
    const allItems = [...catalog.items, ...(catalog.quarantine ?? [])];
    const gp20 = allItems.find((item) => item.id === "gp-20-ultimatum");
    const gp31 = allItems.find((item) => item.id === "gp-31-grenade-pistol");
    expect(gp20).toMatchObject({ model: "GP-20", nameZh: "最后通牒" });
    expect(gp31).toMatchObject({ model: "GP-31", nameZh: "榴弹手枪" });
    if (gp20?.admissionStatus === "admitted") {
      expect(
        searchEquipment(catalog.items, "最后通牒").map(
          (result) => result.item.id,
        ),
      ).toContain("gp-20-ultimatum");
      expect(
        searchEquipment(catalog.items, "最后通牒").map(
          (result) => result.item.id,
        ),
      ).not.toContain("gp-31-grenade-pistol");
      expect(
        searchEquipment(catalog.items, "核弹手枪").map(
          (result) => result.item.id,
        ),
      ).toContain("gp-20-ultimatum");
      expect(
        searchEquipment(catalog.items, "核弹手枪").map(
          (result) => result.item.id,
        ),
      ).not.toContain("gp-31-grenade-pistol");
    }
    expect(
      searchEquipment(catalog.items, "榴弹手枪").map(
        (result) => result.item.id,
      ),
    ).toContain("gp-31-grenade-pistol");
  });

  it("keeps POI CQC-72 separate from the Entrenched Division CQC-73", () => {
    const allItems = [...catalog.items, ...(catalog.quarantine ?? [])];
    const cqc72 = allItems.find(
      (item) => item.id === "cqc-72-entrenchment-tool",
    );
    const cqc73 = catalog.items.find(
      (item) => item.id === "cqc-73-entrenchment-tool",
    );
    expect(cqc72?.nameEn).toBe("CQC-72 Entrenchment Tool");
    expect(cqc72?.acquisition.kind).not.toBe("warbond");
    expect(cqc73?.model).toBe("CQC-73");
    expect(cqc73?.nameZh).toBeTruthy();
    expect(cqc73?.acquisition).toMatchObject({
      kind: "warbond",
      warbondId: "entrenched-division",
      page: 1,
      itemMedals: 20,
    });
  });

  it("does not publish a generic official suffix as a weapon name", () => {
    const allItems = [...catalog.items, ...(catalog.quarantine ?? [])];
    for (const identity of [
      { model: "P-40-K" },
      { model: "R-40-K" },
      { nameEn: "M7S SMG" },
    ]) {
      const item = allItems.find((entry) =>
        identity.model
          ? entry.model === identity.model
          : entry.nameEn === identity.nameEn,
      );
      const label = identity.model ?? identity.nameEn;
      expect(item, label).toBeDefined();
      if (item?.nameZh)
        expect(item.nameZh).not.toMatch(/^(手枪|步枪|冲锋枪)$/u);
    }
  });

  it("normalizes aliases without empty punctuation, leading separators or duplicates", () => {
    for (const item of [...catalog.items, ...(catalog.quarantine ?? [])]) {
      const aliases = item.aliases.map((alias) => alias.text);
      expect(
        aliases.filter((alias) => !normalize(alias)),
        item.id,
      ).toEqual([]);
      expect(
        aliases.filter((alias) => /^[、，,。；;：:]/u.test(alias)),
        item.id,
      ).toEqual([]);
      expect(new Set(aliases.map(normalize)).size, item.id).toBe(
        aliases.length,
      );
      expect(aliases.join("、"), item.id).not.toMatch(/、[、，,]/u);
      expect(aliases.join("、"), item.id).not.toMatch(/^[、，,]|[、，,]$/u);
    }
  });

  it("keeps known mojibake out of user-visible application source", () => {
    const appSource = readFileSync(
      resolve(process.cwd(), "src/app.tsx"),
      "utf8",
    );
    for (const broken of [
      "璁″垝鍚堣",
      "鏆傛棤瑁呭",
      "鐗╁搧浠锋牸",
      "鏈€楂樻湰椤甸棬妫€",
    ]) {
      expect(appSource).not.toContain(broken);
    }
    for (const expected of [
      "计划合计",
      "暂无装备",
      "物品价格",
      "最高累计前置",
    ]) {
      expect(appSource).toContain(expected);
    }
  });
});
