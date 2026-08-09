import { describe, expect, it } from "vitest";
import {
  parseWarbondContents,
  selectWarbondContentsEntry,
} from "../../scripts/wiki-normalize.mjs";

const capturedAt = "2026-08-08T00:00:00.000Z";
const page = (wikitext: string) => ({
  title: "Entrenched Division Premium Warbond",
  pageid: 17209,
  revid: 124372,
  url: "https://helldivers.wiki.gg/wiki/Entrenched_Division_Premium_Warbond",
  categories: ["Warbonds"],
  wikitext,
});

describe("Warbond Contents reverse index", () => {
  it("uses the Type column, not the File link, and selects the canonical item", () => {
    const contents = parseWarbondContents(
      page(`===Page 1===
{{Acquisitions Page
 |spent_to_unlock = 0
 |1_cost = 20
 |1_link = CQC-73 Entrenchment Tool
 |1_name = CQC-73 Entrenchment Tool
}}
{|class="wikitable"
|-
|[[File:CQC-73.png]]||[[CQC-73 Entrenchment Tool]]||[[Weapons|Secondary Weapon]]||{{Currency|Medals|20|notext}}
|}`),
      capturedAt,
    );
    const byId = new Map([[contents.warbondId, contents]]);
    expect(contents.pages[0].entries[0]).toMatchObject({
      canonicalTitle: "CQC-73 Entrenchment Tool",
      type: "Secondary Weapon",
      itemMedals: 20,
    });
    expect(
      selectWarbondContentsEntry(
        { canonicalTitle: "CQC-73 Entrenchment Tool", category: "weapon" },
        byId,
      ),
    ).toMatchObject({
      warbondId: "entrenched-division",
      page: 1,
      itemMedals: 20,
    });
  });

  it("retains unknown prices as null and does not guess a page threshold", () => {
    const contents = parseWarbondContents(
      page(`===Page 2===
{|class="wikitable"
|-
|[[File:P-40-K.png]]||[[P-40-K Bolt Pistol]]||[[Pistol]]||{{Currency|Medals|??|notext}}
|}`),
      capturedAt,
    );
    expect(contents.pages[0].entries[0].itemMedals).toBeNull();
    expect(contents.pages[0].spentToUnlock).toBeNull();
  });

  it("returns null for a true multi-bond ambiguity instead of taking the first candidate", () => {
    const first = parseWarbondContents(
      page(`===Page 1===
{{Acquisitions Page|1_cost=20|1_link=Shared Equipment}}`),
      capturedAt,
    );
    const second = parseWarbondContents(
      {
        ...page(`===Page 1===
{{Acquisitions Page|1_cost=30|1_link=Shared Equipment}}`),
        title: "Other Premium Warbond",
      },
      capturedAt,
    );
    expect(
      selectWarbondContentsEntry(
        { canonicalTitle: "Shared Equipment", category: "weapon" },
        new Map([
          [first.warbondId, first],
          [second.warbondId, second],
        ]),
      ),
    ).toBeNull();
  });
});
