import { describe, expect, it } from "vitest";
import type { Equipment, SourceRef } from "../types";
import { EquipmentWikiLink } from "./equipment-wiki-link";
import { selectEquipmentWikiUrl } from "../../scripts/lib/equipment-wiki-url.mjs";

let nextPageId = 1000;
const source = (url: string, kind: SourceRef["kind"] = "wiki"): SourceRef => {
  const ref: SourceRef = { kind, label: url, url };
  if (kind === "wiki") {
    ref.pageId = nextPageId;
    ref.revision = nextPageId + 1;
    nextPageId += 2;
  }
  return ref;
};

const item = (
  nameEn: string,
  model: string,
): Pick<Equipment, "nameEn" | "model" | "sourceRefs"> => ({
  nameEn,
  model,
  sourceRefs: [],
});

describe("selectEquipmentWikiUrl", () => {
  it("selects the equipment page for Cremator instead of the warbond or file page", () => {
    const cremator = item("B/FLAM-80 Cremator", "B/FLAM-80");
    cremator.sourceRefs = [
      source(
        "https://helldivers.wiki.gg/wiki/Entrenched_Division_Premium_Warbond",
      ),
      source(
        "https://helldivers.wiki.gg/wiki/File:B/FLAM-80_Cremator_Primary_Render.png",
      ),
      source("https://helldivers.wiki.gg/wiki/B/FLAM-80_Cremator"),
    ];
    expect(selectEquipmentWikiUrl(cremator)).toBe(
      "https://helldivers.wiki.gg/wiki/B/FLAM-80_Cremator",
    );
  });

  it("selects P-33's page regardless of mixed source order", () => {
    const p33 = item("P-33 Missile Pistol", "P-33");
    const refs = [
      source("https://helldivers.wiki.gg/wiki/Exo_Experts_Premium_Warbond"),
      source("https://helldivers.wiki.gg/wiki/P-33_Missile_Pistol"),
      source("https://helldivers.wiki.gg/wiki/File:P-33_Missile_Pistol.png"),
    ];
    p33.sourceRefs = refs;
    const reversed = { ...p33, sourceRefs: [...refs].reverse() };
    expect(selectEquipmentWikiUrl(p33)).toBe(
      "https://helldivers.wiki.gg/wiki/P-33_Missile_Pistol",
    );
    expect(selectEquipmentWikiUrl(reversed)).toBe(selectEquipmentWikiUrl(p33));
  });

  it("uses the normalized canonical title for abbreviated display names and encoded ampersands", () => {
    const hoverPack = {
      ...item("Hover Pack", "LIFT-860"),
      canonicalTitle: "LIFT-860 Hover Pack",
      sourceRefs: [
        source("https://helldivers.wiki.gg/wiki/LIFT-860_Hover_Pack"),
      ],
    };
    const sprayAndPray = {
      ...item("SG-225SP Breaker Spray&Pray", "SG-225SP"),
      sourceRefs: [
        source("https://helldivers.wiki.gg/wiki/SG-225SP_Breaker_Spray%26Pray"),
      ],
    };
    expect(selectEquipmentWikiUrl(hoverPack)).toBe(
      "https://helldivers.wiki.gg/wiki/LIFT-860_Hover_Pack",
    );
    expect(selectEquipmentWikiUrl(sprayAndPray)).toBe(
      "https://helldivers.wiki.gg/wiki/SG-225SP_Breaker_Spray%26Pray",
    );
  });

  it("deduplicates equivalent encoded/underscored pages and strips an accepted query", () => {
    const p33 = item("P-33 Missile Pistol", "P-33");
    p33.sourceRefs = [
      source("https://helldivers.wiki.gg/wiki/P-33_Missile_Pistol"),
      source(
        "https://helldivers.wiki.gg/wiki/P-33%20Missile%20Pistol/?oldid=2",
      ),
    ];
    const selected = selectEquipmentWikiUrl(p33);
    expect(selected).toBe(
      "https://helldivers.wiki.gg/wiki/P-33%20Missile%20Pistol",
    );
    expect(selected).not.toContain("?");
    expect(selected).not.toContain("#");
  });

  it("does not guess from a bond, file page, special page, or unsafe host", () => {
    const refs = [
      source(
        "https://helldivers.wiki.gg/wiki/Entrenched_Division_Premium_Warbond",
      ),
      source("https://helldivers.wiki.gg/wiki/File:B-100.png"),
      source("https://helldivers.wiki.gg/wiki/Special:Search/B-100"),
      source(
        "https://evil.example/https://helldivers.wiki.gg/wiki/B-100_Portable_Hellbomb",
      ),
    ];
    expect(
      selectEquipmentWikiUrl({
        ...item("B-100 Portable Hellbomb", "B-100"),
        sourceRefs: refs,
      }),
    ).toBeNull();
  });

  it("rejects encoded namespaces, HTTP/ports, credentials, lookalike hosts, and ambiguous legal candidates", () => {
    const invalidRefs = [
      source("https://helldivers.wiki.gg/wiki/File%3AB-100_Portable_Hellbomb"),
      source("https://helldivers.wiki.gg/wiki/Category%3AWeapons"),
      source("https://helldivers.wiki.gg/wiki/Template%3AArmor"),
      source("https://helldivers.wiki.gg/wiki/Special%3ASearch/B-100"),
      source("https://helldivers.wiki.gg/wiki/Help%3AContents"),
      source("https://helldivers.wiki.gg/wiki/User%3AExample"),
      source("https://helldivers.wiki.gg/wiki/User_talk%3AExample"),
      source("https://helldivers.wiki.gg/wiki/Talk%3AB-100"),
      source("https://helldivers.wiki.gg/wiki/Project_talk%3AB-100"),
      source("http://helldivers.wiki.gg/wiki/B-100_Portable_Hellbomb"),
      source("https://helldivers.wiki.gg:8443/wiki/B-100_Portable_Hellbomb"),
      source(
        "https://user:password@helldivers.wiki.gg/wiki/B-100_Portable_Hellbomb",
      ),
      source(
        "https://helldivers.wiki.gg.evil.example/wiki/B-100_Portable_Hellbomb",
      ),
      source(
        "https://helldivers.wiki.gg/wiki/B-100_Portable_Hellbomb#procurement",
      ),
      {
        kind: "wiki",
        label: "missing revision",
        url: "https://helldivers.wiki.gg/wiki/B-100_Portable_Hellbomb",
      },
    ];
    expect(
      selectEquipmentWikiUrl({
        ...item("B-100 Portable Hellbomb", "B-100"),
        sourceRefs: invalidRefs,
      }),
    ).toBeNull();

    const ambiguous = {
      ...item("Hover Pack", "LIFT-860"),
      canonicalTitle: "LIFT-860 Hover Pack",
    };
    ambiguous.sourceRefs = [
      source("https://helldivers.wiki.gg/wiki/Hover_Pack"),
      source("https://helldivers.wiki.gg/wiki/LIFT-860_Hover_Pack"),
    ];
    expect(selectEquipmentWikiUrl(ambiguous)).toBeNull();
  });
});

describe("EquipmentWikiLink", () => {
  it("renders an accessible secondary external link with safe target attributes", () => {
    const vnode = EquipmentWikiLink({
      item: {
        nameZh: "焚燃者",
        wikiUrl: "https://helldivers.wiki.gg/wiki/B/FLAM-80_Cremator",
      },
    });
    expect(vnode?.props.href).toBe(
      "https://helldivers.wiki.gg/wiki/B/FLAM-80_Cremator",
    );
    expect(vnode?.props.target).toBe("_blank");
    expect(vnode?.props.rel).toBe("noopener noreferrer external");
    expect(vnode?.props["aria-label"]).toBe("在 Wiki 查看焚燃者");
    expect(vnode?.props.children).toBe("在 Wiki 查看");
  });

  it("renders nothing when the generated projection has no reliable URL", () => {
    expect(
      EquipmentWikiLink({ item: { nameZh: "未知装备", wikiUrl: undefined } }),
    ).toBeNull();
  });
});
