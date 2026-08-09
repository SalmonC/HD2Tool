import { describe, expect, it } from "vitest";
import { catalog } from "../data/catalog";
import type { AttackComponent, Equipment } from "../types";
import { getApSummaries } from "./attack-summary";

const source = {
  kind: "wiki" as const,
  label: "test",
  url: "https://example.test/ap",
};
const component = (
  id: string,
  componentType: AttackComponent["componentType"],
  value?: number,
  extra: Partial<AttackComponent["fields"]> = {},
): AttackComponent => ({
  id,
  componentType,
  label: componentType,
  fields: {
    ...(value === undefined
      ? {}
      : {
          armorPenetration: {
            label: `AP ${value}`,
            value,
            labelZh: `L${value}`,
            sourceRefs: [source],
          },
        }),
    ...extra,
  },
  sourceRefs: [source],
  verificationStatus: "verified",
});
const withComponents = (components: AttackComponent[]): Equipment =>
  ({
    ...(catalog.quarantine?.[0] ?? catalog.items[0]),
    attackProfile: {
      version: "test",
      sourceRefs: [source],
      verificationStatus: "verified",
      components,
    },
  }) as Equipment;

describe("attack card AP summaries", () => {
  it("uses one component direct AP and hides angle values from the card summary", () => {
    const summaries = getApSummaries(
      withComponents([
        component("direct", "projectile", 2, {
          anglePenetration: { direct: 2, slight: 1 },
        }),
      ]),
      catalog,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].value).toBe(2);
    expect(summaries[0].minValue).toBeUndefined();
  });

  it("keeps different projectile and shrapnel AP separate", () => {
    expect(
      getApSummaries(
        withComponents([
          component("projectile", "projectile", 2),
          component("shrapnel", "shrapnel", 3),
        ]),
        catalog,
      ).map((entry) => entry.value),
    ).toEqual([2, 3]);
  });

  it("merges same direct AP while preserving range values", () => {
    const same = getApSummaries(
      withComponents([
        component("projectile", "projectile", 2),
        component("explosion", "explosion", 2),
      ]),
      catalog,
    );
    expect(same).toHaveLength(1);
    expect(same[0].componentLabel).toBeUndefined();
    const range = getApSummaries(
      withComponents([
        component("charge", "charge", undefined, {
          armorPenetration: {
            label: "AP 6–8",
            minValue: 6,
            maxValue: 8,
            labelZh: "Anti-Tank",
            sourceRefs: [source],
          },
        }),
      ]),
      catalog,
    );
    expect(range[0]).toMatchObject({ minValue: 6, maxValue: 8 });
  });

  it("caps preview summaries at three components", () => {
    const summaries = getApSummaries(
      withComponents(
        [1, 2, 3, 4].map((value) => component(`c${value}`, "alternate", value)),
      ),
      catalog,
    );
    expect(summaries).toHaveLength(3);
  });
});
