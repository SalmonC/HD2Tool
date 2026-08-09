import { describe, expect, it } from "vitest";
import localization from "./source/official-localization.json";
import p0_2Translation from "./source/translation-p0-2.json";

describe("official localization evidence", () => {
  it("uses the explicit equipment resource pair and stable Items keys", () => {
    expect(localization.sourceRegistry).toHaveLength(1);
    expect(localization.sourceRegistry[0].id).toBe("equipment-primary");
    expect(localization.alignment.pairedResources).toHaveLength(1);
    const cremator = localization.records.find(
      (record) => record.key === 563225959,
    );
    expect(cremator).toMatchObject({
      english: "Cremator",
      simplifiedChinese: "焚燃者",
      englishFile: "0x4f68a1db55e6da09.strings.json",
      simplifiedFile: "0x95ee90e8062250a6.strings.json",
    });
    expect(cremator?.englishSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cremator?.simplifiedSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not create booster localization records", () => {
    expect(
      localization.records.some((record) =>
        /Muscle Enhancement|Stamina Enhancement|UAV Recon Booster|Armed Resupply Pods/.test(
          record.english,
        ),
      ),
    ).toBe(false);
  });

  it("keeps the ten P0-2 name decisions in a separate auditable matrix", () => {
    expect(p0_2Translation.records).toHaveLength(10);
    expect(
      p0_2Translation.records.every((record) =>
        [
          "exact-same-key",
          "explicit-split-key-composition",
          "official-zh-hans-announcement",
          "community-two-source",
          "unresolved",
        ].includes(record.matchMode),
      ),
    ).toBe(true);
    for (const record of p0_2Translation.records) {
      expect(record.proposedNameZh, record.canonicalId).toBeTruthy();
      expect(
        record.supportSourceIds.length,
        record.canonicalId,
      ).toBeGreaterThan(0);
      expect(record.crosscheckSourceIds, record.canonicalId).toBeDefined();
      expect(record.candidateCount, record.canonicalId).toBe(
        record.candidateNames.length,
      );
      expect(
        record.supportSourceIds.some((sourceId) =>
          (record.conflictSourceIds as readonly string[]).includes(sourceId),
        ),
      ).toBe(false);
      expect(record.conflictReason, record.canonicalId).toBeTruthy();
    }
  });
});
