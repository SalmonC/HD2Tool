import { describe, expect, it } from "vitest";
import rawCandidates from "./candidates/user-supplied.json";
import { catalogItems } from "./catalog";
import type { CandidateLayer } from "../types";

describe("user-supplied candidate layer", () => {
  it("preserves raw text and keeps pending candidates out of the formal catalog", () => {
    const candidates = rawCandidates as CandidateLayer;
    expect(candidates.records).toHaveLength(10);
    expect(candidates.records[0].rawText).toBe("电榴弹–法律铁碗");
    expect(
      candidates.records.every(
        (record) =>
          record.source === "user" && record.verificationStatus === "pending",
      ),
    ).toBe(true);
    const formalText = catalogItems.flatMap((item) => [
      item.nameZh,
      ...item.aliases.map((alias) => alias.text),
    ]);
    expect(formalText).not.toContain("法律铁碗");
    expect(formalText).not.toContain("铁腕");
  });
});
