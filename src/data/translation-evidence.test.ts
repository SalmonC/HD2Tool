import { describe, expect, it } from "vitest";
import communityRaw from "./source/xiaoheihe-community-aliases.json";
import evidenceRaw from "./source/translation-evidence.json";
import wikiRaw from "./source/wiki-normalized.json";

type EvidenceRecord = (typeof evidenceRaw.records)[number];

const records = new Map(
  evidenceRaw.records.map((record) => [record.canonicalId, record]),
);
const sources = new Map(
  evidenceRaw.sources.map((source) => [source.id, source]),
);
const normalizeModel = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, "");
const recordForCommunity = (item: (typeof communityRaw.equipment)[number]) =>
  evidenceRaw.records.find(
    (record) =>
      record.canonicalId === item.id ||
      ("legacyCommunityIds" in record &&
        record.legacyCommunityIds?.includes(item.id)) ||
      (item.model !== "—" &&
        record.model &&
        normalizeModel(record.model) === normalizeModel(item.model)),
  );

describe("中文名称证据层", () => {
  it("证据快照保留 URL、命中词、访问时间、来源等级与冲突备注", () => {
    expect(Number.isNaN(Date.parse(evidenceRaw.capturedAt))).toBe(false);
    for (const source of evidenceRaw.sources) {
      expect(source.url, source.id).toMatch(/^https:\/\//);
      expect(
        [
          "candidate",
          "official-zh-hans",
          "official-zh-hant-crosscheck",
          "independent-community",
        ].includes(source.level),
        source.id,
      ).toBe(true);
    }
    for (const record of evidenceRaw.records) {
      expect(record.hitKeywords.length, record.canonicalId).toBeGreaterThan(0);
      expect(
        Object.prototype.hasOwnProperty.call(record, "conflictNote"),
        record.canonicalId,
      ).toBe(true);
    }
  });

  it("以 Wiki canonical 身份覆盖全部社区目标，并额外收录焚燃者", () => {
    for (const item of communityRaw.equipment) {
      const record = recordForCommunity(item);
      expect(record, item.id).toBeDefined();
      expect(record?.canonicalEnglish, item.id).toBeTruthy();
      expect(record?.model, item.id).not.toBe("—");
      expect(
        wikiRaw.items.some((wikiItem) => wikiItem.id === record?.canonicalId),
        `${item.id} -> ${record?.canonicalId}`,
      ).toBe(true);
    }

    const cremator = records.get("b-flam-80-cremator");
    expect(cremator).toMatchObject({
      model: "B/FLAM-80",
      canonicalEnglish: "B/FLAM-80 Cremator",
      candidateZh: "焚燃者",
      status: "official",
    });
    expect(wikiRaw.items.some((item) => item.id === "b-flam-80-cremator")).toBe(
      true,
    );
  });

  it("每个已通过名称都有独立于小黑盒的可访问证据", () => {
    for (const record of evidenceRaw.records.filter(
      (entry) => entry.status !== "unresolved",
    )) {
      const independent = record.sourceIds
        .map((id) => sources.get(id))
        .filter((source) => source && source.id !== "xiaoheihe-transcript");
      expect(independent.length, record.canonicalId).toBeGreaterThan(0);
      expect(
        independent.every((source) => /^https:\/\//.test(source?.url ?? "")),
        record.canonicalId,
      ).toBe(true);
    }
  });

  it("若后续新增对象未找到独立证据，必须保持 unresolved", () => {
    const unresolved = evidenceRaw.records.filter(
      (record) => record.status === "unresolved",
    );
    for (const record of unresolved) {
      expect(record.sourceIds, record.canonicalId).toEqual([
        "xiaoheihe-transcript",
      ]);
      expect(record.conflictNote, record.canonicalId).toBeTruthy();
    }

    expect(
      evidenceRaw.records.every((record) =>
        ["official", "verified-community", "unresolved"].includes(
          record.status,
        ),
      ),
    ).toBe(true);
  });

  it("明确记录简繁差异、型号纠正和正式名冲突", () => {
    expect(records.get("sg-451-cookout")?.conflictNote).toContain("燎原");
    expect(records.get("las-58-talon")?.conflictNote).toContain("利爪");
    expect(records.get("lift-860-hover-pack")).toMatchObject({
      model: "LIFT-860",
      canonicalEnglish: "Hover Pack",
    });
    expect(records.get("b-100-portable-hellbomb")).toMatchObject({
      candidateZh: "便携式地狱火炸弹",
      status: "official",
    });
    expect(records.get("b-100-portable-hellbomb")?.conflictNote).toContain(
      "便捷式",
    );
  });

  it("小黑盒的 53 个称呼仍唯一映射，证据层不承载数值或购买事实", () => {
    const mappings = [
      ...communityRaw.equipment.flatMap((item) =>
        item.aliases.map((alias) => ({
          alias,
          target: recordForCommunity(item)?.canonicalId ?? `missing:${item.id}`,
        })),
      ),
      ...communityRaw.glossaryTerms.flatMap((term) =>
        term.aliases.map((alias) => ({ alias, target: term.id })),
      ),
    ];
    expect(mappings).toHaveLength(53);
    const targets = new Map<string, Set<string>>();
    for (const mapping of mappings) {
      const normalizedAlias = mapping.alias
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .replace(/[\s\p{P}\p{S}_]+/gu, "");
      const set = targets.get(normalizedAlias) ?? new Set<string>();
      set.add(mapping.target);
      targets.set(normalizedAlias, set);
    }
    expect(
      [...targets.entries()].filter(([, targetIds]) => targetIds.size !== 1),
    ).toEqual([]);

    const forbidden = [
      "category",
      "acquisition",
      "attackProfile",
      "weaponProfile",
      "page",
      "price",
    ];
    for (const record of evidenceRaw.records as EvidenceRecord[]) {
      for (const key of forbidden) {
        expect(
          Object.prototype.hasOwnProperty.call(record, key),
          `${record.canonicalId}.${key}`,
        ).toBe(false);
      }
    }
  });
});
