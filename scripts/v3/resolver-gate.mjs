import { fixtureConfig } from "./migration-common.mjs";

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function uiGroupForProductKind(productKind) {
  if (["primary-weapon", "secondary-weapon", "grenade"].includes(productKind))
    return "weapon";
  if (productKind === "body-armor") return "armor";
  if (["support-weapon", "other-stratagem"].includes(productKind))
    return "stratagem";
  return null;
}

export function assertFixtureRawCoordinate(raw, fixture) {
  const page = raw.pages[fixture.rawIndex];
  expect(page, `${fixture.fixtureId}: raw index ${fixture.rawIndex} missing`);
  expect(
    page.pageid === fixture.pageId,
    `${fixture.fixtureId}: pageId mismatch at raw index`,
  );
  expect(
    page.revid === fixture.revision,
    `${fixture.fixtureId}: revision mismatch at raw index`,
  );
  return page;
}

function equipmentFor(resolution, fixture) {
  const record = resolution.equipmentRecords.find(
    (entry) => entry.page.pageid === fixture.pageId,
  );
  expect(
    record,
    `${fixture.fixtureId}: equipment resolver did not produce a record`,
  );
  return record;
}

function numberField(text, field) {
  return Number(
    String(text).match(
      new RegExp(`\\|${field}\\s*=\\s*\\{\\{Currency\\|Medals\\|([0-9]+)`, "i"),
    )?.[1] ?? NaN,
  );
}

function fixtureChecks(fixture, page, resolution, candidateRecords, catalog) {
  const details = {
    fixtureId: fixture.fixtureId,
    pageId: page.pageid,
    revision: page.revid,
    mode: fixture.mode,
  };
  if (fixture.fixtureId === "cpg-48-armor-conflict") {
    details.bodyMedals = numberField(page.wikitext, "cost");
    details.helmetMedals = numberField(page.wikitext, "Helmet_cost");
    expect(
      details.bodyMedals === fixture.expectedBodyMedals,
      `${fixture.fixtureId}: body cost mismatch`,
    );
    expect(
      details.helmetMedals === fixture.expectedHelmetMedals,
      `${fixture.fixtureId}: helmet cost mismatch`,
    );
    return details;
  }
  if (fixture.fixtureId.endsWith("-contents")) {
    expect(
      /==+\s*Contents\s*==/iu.test(page.wikitext),
      `${fixture.fixtureId}: missing raw Contents section`,
    );
    return details;
  }
  const record = equipmentFor(resolution, fixture);
  details.id = record.item.id;
  details.productKind = record.scope.productKind;
  details.uiGroup = uiGroupForProductKind(record.scope.productKind);
  if (fixture.expectedProductKind)
    expect(
      record.scope.productKind === fixture.expectedProductKind,
      `${fixture.fixtureId}: product kind mismatch`,
    );
  if (fixture.expectedUiGroup)
    expect(
      details.uiGroup === fixture.expectedUiGroup,
      `${fixture.fixtureId}: UI group mismatch`,
    );
  if (fixture.fixtureId === "exo-55")
    expect(
      record.item.rawFields?.stratagem_type === "Vehicle",
      "EXO-55 must use raw Vehicle stratagem semantics",
    );
  if (fixture.fixtureId === "mg-43")
    expect(
      record.item.rawFields?.stratagem_type === "Support Weapon",
      "MG-43 must use raw Support Weapon semantics",
    );
  if (fixture.fixtureId === "p-33") {
    const profile = record.item.attackProfile;
    expect(
      profile && !profile.armorPenetration,
      "P-33 must not have a root AP value",
    );
    const components = profile.components.map((component) => ({
      role: component.componentType,
      standardDamage: component.fields?.standardDamage,
      armorPenetration: component.fields?.armorPenetration?.value,
    }));
    details.components = components;
    expect(
      JSON.stringify(components) === JSON.stringify(fixture.expectedComponents),
      "P-33 direct/explosion components mismatch",
    );
  }
  if (fixture.fixtureId === "las-13-item")
    expect(record.item.id === "las-13-trident", "LAS item identity mismatch");
  const expectedIds = {
    "cqc-72": "cqc-72-entrenchment-tool",
    "cqc-73": "cqc-73-entrenchment-tool",
    "gp-20": "gp-20-ultimatum",
    "gp-31": "gp-31-grenade-pistol",
  };
  if (expectedIds[fixture.fixtureId])
    expect(
      record.item.id === expectedIds[fixture.fixtureId],
      `${fixture.fixtureId}: stable identity mismatch`,
    );
  return details;
}

export function runResolverFixtures({
  raw,
  resolution,
  candidateRecords,
  catalog,
}) {
  const results = [];
  for (const fixture of fixtureConfig.fixtures) {
    try {
      const page = assertFixtureRawCoordinate(raw, fixture);
      const details = fixtureChecks(
        fixture,
        page,
        resolution,
        candidateRecords,
        catalog,
      );
      results.push({ fixtureId: fixture.fixtureId, status: "passed", details });
    } catch (error) {
      results.push({
        fixtureId: fixture.fixtureId,
        status: "failed",
        error: String(error.message ?? error),
      });
    }
  }

  const entrenched = candidateRecords.filter(
    (record) =>
      record.sourcePageId === 17209 && record.disposition === "resolved",
  );
  const exo = candidateRecords.filter(
    (record) =>
      record.sourcePageId === 18420 && record.disposition === "resolved",
  );
  const exactSet = (records) =>
    [...new Set(records.map((record) => record.canonicalId))].sort();
  const goldChecks = [
    {
      fixtureId: "entrenched-exact-set",
      actual: exactSet(entrenched),
      expectedCount: 8,
      requiredId: "cqc-73-entrenchment-tool",
    },
    {
      fixtureId: "exo-experts-exact-set",
      actual: exactSet(exo),
      expectedCount: 7,
      requiredId: "p-33-missile-pistol",
    },
  ].map((check) => ({
    ...check,
    status:
      check.actual.length === check.expectedCount &&
      check.actual.includes(check.requiredId)
        ? "passed"
        : "failed",
  }));
  results.push(
    ...goldChecks.map(
      ({ fixtureId, actual, expectedCount, requiredId, status }) => ({
        fixtureId,
        status,
        details: {
          actualCount: actual.length,
          expectedCount,
          requiredId,
          ids: actual,
        },
      }),
    ),
  );

  const siegeCorrection = candidateRecords.find(
    (record) =>
      record.sourcePageId === 15852 &&
      record.canonicalTitle === "LAS-16 Trident" &&
      record.canonicalId === "las-13-trident",
  );
  results.push({
    fixtureId: "siege-las-explicit-correction",
    status:
      siegeCorrection?.resolutionMode === "correction" ? "passed" : "failed",
    details: siegeCorrection ?? null,
  });

  const aliases = new Map(
    (catalog.items ?? []).map((item) => [item.id, item.aliases ?? []]),
  );
  const gp20Aliases = (aliases.get("gp-20-ultimatum") ?? []).map(
    (alias) => alias.text,
  );
  const gp31Aliases = (aliases.get("gp-31-grenade-pistol") ?? []).map(
    (alias) => alias.text,
  );
  const aliasIsolated =
    !gp20Aliases.some((alias) => gp31Aliases.includes(alias)) &&
    !gp31Aliases.includes("最后通牒") &&
    !gp31Aliases.includes("核弹手枪");
  results.push({
    fixtureId: "gp-alias-isolation",
    status: aliasIsolated ? "passed" : "failed",
    details: { gp20Aliases, gp31Aliases },
  });

  const failed = results.filter((result) => result.status === "failed");
  return {
    results,
    passed: failed.length === 0,
    failedFixtureIds: failed.map((result) => result.fixtureId),
  };
}
