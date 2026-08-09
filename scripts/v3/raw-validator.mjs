import assert from "node:assert/strict";

// This module intentionally does not import the production normalizer, scope
// classifier, or migration-common resolver. It is a narrow raw-wikitext
// witness for the release-critical identities and warbond offers.

const FIXTURE_COORDINATES = Object.freeze({
  mg: [2268, 126234],
  exo55: [18423, 126795],
  cqc72: [10335, 127324],
  cqc73: [17266, 125302],
  gp20: [10341, 126514],
  gp31: [4562, 126215],
  p33: [18455, 126332],
  cpg: [17272, 126430],
  entrenched: [17209, 124372],
  exo: [18420, 125861],
  las13: [15881, 119052],
  siege: [15852, 124384],
});

const EXPECTED_BONDS = Object.freeze({
  entrenched: Object.freeze([
    ["cqc-73-entrenchment-tool", 1, 20],
    ["smg-flam-34-stoker", 1, 35],
    ["cpg-48-sapper", 1, 45],
    ["cph-26-commandant", 2, 55],
    ["g-48-giga-grenade", 2, 50],
    ["a-gm-17-gas-mortar-sentry", 2, 85],
    ["b-flam-80-cremator", 3, 110],
    ["p-69-veto", 3, 65],
  ]),
  exo: Object.freeze([
    ["smg-203-gallant", 1, 35],
    ["mgx-42-bullet-storm", 1, 75],
    ["o-3-free-spirit", 1, 45],
    ["exo-51-lumberer-exosuit", 2, 50],
    ["p-33-missile-pistol", 2, 50],
    ["o-2-heavy-operator", 2, 55],
    ["exo-55-breakthrough-exosuit", 3, 50],
  ]),
});

function field(text, name) {
  const match = String(text ?? "").match(
    new RegExp(`^\\s*\\|\\s*${name}\\s*=\\s*(.*?)\\s*$`, "imu"),
  );
  return match?.[1] ?? null;
}

function linkedTitle(cell) {
  const match = String(cell ?? "").match(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/u);
  return match
    ? match[1].replace(/^:+/u, "").replace(/_/gu, " ").split("#", 1)[0].trim()
    : null;
}

function linkedLabel(cell) {
  const match = String(cell ?? "").match(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/u);
  return match
    ? (match[2] ?? match[1]).replace(/_/gu, " ").split("#", 1)[0].trim()
    : null;
}

function idFromTitle(title) {
  return String(title ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[“”"']/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function numberFrom(value) {
  const match = String(value ?? "")
    .replace(/,/gu, "")
    .match(/\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function pageBlocks(text) {
  const headings = [
    ...String(text ?? "").matchAll(/^={3,}\s*Page\s*(\d+)\s*={3,}\s*$/gimu),
  ];
  return headings.map((heading, index) => ({
    page: Number(heading[1]),
    text: text.slice(heading.index, headings[index + 1]?.index ?? text.length),
  }));
}

function rowsFromPageBlock(block) {
  const rows = [];
  for (const table of String(block ?? "").matchAll(
    /\{\|[^\n]*\n([\s\S]*?)\n\|\}/gu,
  )) {
    if (!/!Icon!!Item!!Type!!Cost/iu.test(table[1])) continue;
    for (const row of table[1].split(/\n\|-\s*/u).slice(1)) {
      const cells = row
        .split(/\|\|/u)
        .map((cell) => cell.replace(/^\s*\|\s*/u, "").trim());
      if (cells.length < 4) continue;
      const plainItem = cells[1]
        .replace(/\[\[[^\]]+\]\]/gu, "")
        .replace(/<[^>]+>/gu, "")
        .replace(/'{2,}/gu, "")
        .trim();
      const title = linkedTitle(cells[1]) ?? (plainItem || null);
      const type =
        linkedLabel(cells[2]) ?? cells[2].replace(/'{2,}/gu, "").trim();
      const itemMedals = numberFrom(cells[3]);
      rows.push({
        title,
        id: idFromTitle(title),
        type,
        itemMedals,
        linked: Boolean(title),
      });
    }
  }
  return rows;
}

function supportedTableRow(row) {
  const type = String(row.type ?? "");
  return (
    !/helmet|cape|player\s*card|pattern|emote|title|currency|booster/iu.test(
      type,
    ) &&
    /primary|secondary|support\s*weapon|weapon|gun|throwable|vehicle|armor|sentry|mortar/iu.test(
      type,
    )
  );
}

function assertCoordinate(raw, key) {
  const [pageId, revision] = FIXTURE_COORDINATES[key];
  const page = raw.pages.find((candidate) => candidate.pageid === pageId);
  assert.ok(page, `${key} raw page must exist`);
  assert.equal(page.revid, revision, `${key} raw revision must be frozen`);
  return page;
}

function parseBondOffers(page, expected) {
  const rows = pageBlocks(page.wikitext).flatMap((block) =>
    rowsFromPageBlock(block.text).map((row) => ({ ...row, page: block.page })),
  );
  const supported = rows.filter(supportedTableRow);
  const expectedIds = new Set(expected.map(([id]) => id));
  const actual = supported.filter((row) => expectedIds.has(row.id));
  assert.equal(
    actual.length,
    expected.length,
    `${page.title} must yield exactly ${expected.length} supported fixture rows`,
  );
  const actualKeys = actual
    .map((row) => `${row.id}:${row.page}:${row.itemMedals}`)
    .sort();
  const expectedKeys = expected
    .map(([id, pageNumber, itemMedals]) => `${id}:${pageNumber}:${itemMedals}`)
    .sort();
  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `${page.title} raw Contents offers must match the exact fixture set`,
  );
  return actual;
}

function assertProductionDiff(rawSets, productionSets) {
  const diff = [];
  for (const [bondKey, expected] of Object.entries(EXPECTED_BONDS)) {
    const production = productionSets.find(
      (set) =>
        set.warbondId ===
        (bondKey === "entrenched" ? "entrenched-division" : "exo-experts"),
    );
    const raw = rawSets[bondKey]
      .map((row) => ({
        id: row.id,
        page: row.page,
        itemMedals: row.itemMedals,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const actual = [
      ...new Map(
        (production?.expectedOffers ?? []).flatMap((entry) =>
          entry.offers.map((offer) => [
            `${entry.canonicalId}:${offer.page}:${offer.itemMedals}`,
            {
              id: entry.canonicalId,
              page: offer.page,
              itemMedals: offer.itemMedals,
            },
          ]),
        ),
      ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id));
    if (JSON.stringify(raw) !== JSON.stringify(actual))
      diff.push({ bondKey, raw, production: actual });
  }
  return diff;
}

export function runRawCriticalValidation(raw, productionSets = []) {
  const mg = assertCoordinate(raw, "mg");
  assert.match(mg.wikitext, /\|\s*stratagem_type\s*=\s*Support Weapon/iu);
  assert.match(mg.wikitext, /\|\s*weapon_category\s*=\s*Support Weapons/iu);
  assert.match(
    mg.wikitext,
    /\|\s*source\s*=\s*Patriotic Administration Center/iu,
  );

  const exo55 = assertCoordinate(raw, "exo55");
  assert.match(exo55.wikitext, /\|\s*stratagem_type\s*=\s*Vehicle/iu);
  assert.match(exo55.wikitext, /\|\s*weapon_category\s*=\s*Exosuit Weapon/iu);
  assert.match(exo55.wikitext, /\|\s*source\s*=.*Exo Experts/iu);

  const cqc72 = assertCoordinate(raw, "cqc72");
  const cqc73 = assertCoordinate(raw, "cqc73");
  assert.equal(cqc72.title, "CQC-72 Entrenchment Tool");
  assert.equal(cqc73.title, "CQC-73 Entrenchment Tool");
  assert.match(cqc72.wikitext, /\|\s*weapon_category\s*=\s*Support Weapons/iu);
  assert.match(cqc72.wikitext, /points of interest/iu);
  assert.match(
    cqc73.wikitext,
    /\|\s*weapon_category\s*=\s*Secondary Weapons/iu,
  );
  assert.match(cqc73.wikitext, /Entrenched Division Premium Warbond/iu);

  const gp20 = assertCoordinate(raw, "gp20");
  const gp31 = assertCoordinate(raw, "gp31");
  assert.match(gp20.wikitext, /Servants of Freedom Premium Warbond/iu);
  assert.match(gp20.wikitext, /\{\{Currency\|Medals\|40/iu);
  assert.match(gp31.wikitext, /Democratic Detonation Premium Warbond/iu);
  assert.match(gp31.wikitext, /\{\{Currency\|Medals\|60/iu);

  const p33 = assertCoordinate(raw, "p33");
  const p33Damage = field(p33.wikitext, "damage");
  const p33Penetration = field(p33.wikitext, "penetration");
  assert.match(p33Damage, /Ballistic\|1,000 Projectile/iu);
  assert.match(p33Damage, /Explosion\|300/iu);
  assert.match(p33Penetration, /5\|AP[^\n]*Projectile/iu);
  assert.match(p33Penetration, /3\|AP[^\n]*Explosion/iu);
  assert.doesNotMatch(p33.wikitext, /^\s*\|\s*(?:armor_penetration|ap)\s*=/imu);

  const cpg = assertCoordinate(raw, "cpg");
  assert.equal(numberFrom(field(cpg.wikitext, "cost")), 45);
  assert.equal(numberFrom(field(cpg.wikitext, "Helmet_cost")), 35);

  const las13 = assertCoordinate(raw, "las13");
  const siege = assertCoordinate(raw, "siege");
  assert.match(las13.title, /^LAS-13 Trident$/u);
  assert.match(siege.wikitext, /\[\[LAS-16 Trident\]\]/u);
  assert.notEqual(las13.pageid, siege.pageid);

  const entrenched = parseBondOffers(
    assertCoordinate(raw, "entrenched"),
    EXPECTED_BONDS.entrenched,
  );
  const exo = parseBondOffers(assertCoordinate(raw, "exo"), EXPECTED_BONDS.exo);
  const productionDiff = assertProductionDiff(
    { entrenched, exo },
    productionSets,
  );
  return {
    passed: productionDiff.length === 0,
    checked: [
      "mg",
      "exo55",
      "cqc72",
      "cqc73",
      "gp20",
      "gp31",
      "p33",
      "cpg",
      "las13",
      "siege",
      "entrenched",
      "exo",
    ],
    rawOffers: { entrenched, exo },
    productionDiff,
  };
}

export function rawTableNegativeCases(raw) {
  const ranks = raw.pages.find((page) => page.pageid === 10898);
  assert.ok(
    ranks,
    "the fixed Borderline Justice raw Title fixture must be present",
  );
  assert.equal(
    ranks.revid,
    127331,
    "the fixed Borderline Justice Title fixture revision must be frozen",
  );
  const rows = pageBlocks(ranks.wikitext).flatMap((block) =>
    rowsFromPageBlock(block.text),
  );
  const titleRows = rows.filter((row) => row.type === "Title");
  assert.ok(
    titleRows.length > 0,
    "a real unlinked Title row must be present in the raw table",
  );
  assert.ok(
    rows.every(
      (row) =>
        row.title !== "Ranks" ||
        row.type === "Currency" ||
        row.type === "Title",
    ),
    "Ranks must not be treated as a product item by first-link selection",
  );
  const titleRow = rows.find((row) => row.title === "Super Sheriff");
  assert.ok(
    titleRow,
    "the raw fixture must include the Super Sheriff Title row",
  );
  assert.equal(
    titleRow.type,
    "Title",
    "unlinked Title rows retain their type and do not become equipment",
  );
  const cpgRows = rowsFromPageBlock(
    pageBlocks(assertCoordinate(raw, "entrenched").wikitext).find(
      (block) => block.page === 1,
    )?.text ?? "",
  );
  assert.ok(
    cpgRows.some(
      (row) => row.title === "CPG-48 Sapper" && row.type === "Medium Armor",
    ),
    "body armor row must remain type-addressable regardless of row order",
  );
  assert.ok(
    cpgRows.some(
      (row) => row.title === "CPG-48 Sapper" && row.type === "Helmet",
    ),
    "helmet row must remain type-addressable regardless of row order",
  );
  return { passed: true };
}

export { EXPECTED_BONDS, FIXTURE_COORDINATES };
