import type { ComponentChildren } from "preact";
import type { AttackComponent, Catalog, Equipment } from "../types";

const componentLabels: Record<string, string> = {
  projectile: "直击",
  shrapnel: "弹片",
  explosion: "爆炸",
  spray: "喷射",
  melee: "近战",
  charge: "蓄力",
  alternate: "替代模式",
  status: "状态",
  other: "组件",
};

export interface ApSummary {
  value?: number;
  minValue?: number;
  maxValue?: number;
  labelZh: string;
  componentLabel?: string;
  componentIds: string[];
}

const componentOrder: Record<string, number> = {
  projectile: 1,
  shrapnel: 2,
  explosion: 3,
  spray: 4,
  melee: 5,
  charge: 6,
  alternate: 7,
  status: 8,
  other: 9,
};

function componentLabelZh(component: AttackComponent): string {
  const label = componentLabels[component.componentType] ?? "组件";
  if (component.chargeLevel) return `${label} ${component.chargeLevel}`;
  const raw = component.label.toLocaleLowerCase("en-US");
  if (raw.includes("shrapnel")) return "弹片";
  if (raw.includes("alternate")) return "替代模式";
  return label;
}

function taxonomyLabel(catalog: Catalog, value: number): string | undefined {
  return catalog.attackTaxonomy?.options.find(
    (option) => option.value === value,
  )?.labelZh;
}

/**
 * Card AP rule: use each component's direct AP. Angle penetration remains detail-only.
 * Components with the same direct AP are merged in the preview; details retain all components.
 */
export function getApSummaries(item: Equipment, catalog: Catalog): ApSummary[] {
  const components = item.attackProfile?.components ?? [];
  const candidates = components.flatMap((component) => {
    const penetration = component.fields.armorPenetration;
    if (
      !penetration ||
      (penetration.value === undefined &&
        (penetration.minValue === undefined ||
          penetration.maxValue === undefined))
    )
      return [];
    const labelZh =
      penetration.labelZh ??
      (penetration.value !== undefined
        ? taxonomyLabel(catalog, penetration.value)
        : undefined);
    if (!labelZh) return [];
    return [
      {
        value: penetration.value,
        minValue: penetration.minValue,
        maxValue: penetration.maxValue,
        labelZh,
        componentLabel: componentLabelZh(component),
        componentIds: [component.id],
      },
    ];
  });
  const groups = new Map<string, ApSummary>();
  for (const candidate of candidates) {
    const key = `${candidate.minValue ?? candidate.value}-${candidate.maxValue ?? candidate.value}-${candidate.labelZh}`;
    const prior = groups.get(key);
    if (!prior) groups.set(key, { ...candidate });
    else {
      prior.componentIds.push(...candidate.componentIds);
      prior.componentLabel = undefined;
    }
  }
  const result = [...groups.values()]
    .map((entry) =>
      entry.componentIds.length > 1
        ? { ...entry, componentLabel: undefined }
        : entry,
    )
    .sort((left, right) => {
      const leftComponent = components.find(
        (component) => component.id === left.componentIds[0],
      );
      const rightComponent = components.find(
        (component) => component.id === right.componentIds[0],
      );
      return (
        (componentOrder[leftComponent?.componentType ?? "other"] ?? 99) -
          (componentOrder[rightComponent?.componentType ?? "other"] ?? 99) ||
        left.componentIds[0].localeCompare(right.componentIds[0])
      );
    });
  return result.slice(0, 3);
}

export function apSummaryText(summary: ApSummary): string {
  const value =
    summary.minValue !== undefined &&
    summary.maxValue !== undefined &&
    summary.minValue !== summary.maxValue
      ? `${summary.minValue}–${summary.maxValue}`
      : String(summary.value ?? summary.minValue ?? "");
  return `${summary.componentLabel ? `${summary.componentLabel} ` : ""}穿甲 ${value} · ${summary.labelZh}`;
}

export function APBadges({
  item,
  catalog,
}: {
  item: Equipment;
  catalog: Catalog;
}): ComponentChildren {
  const summaries = getApSummaries(item, catalog);
  const allCount = (item.attackProfile?.components ?? []).filter(
    (component) => component.fields.armorPenetration?.value !== undefined,
  ).length;
  if (!summaries.length) return null;
  return (
    <div
      className="ap-summary"
      aria-label={`穿甲摘要：${summaries.map(apSummaryText).join("；")}`}
    >
      <span className="ap-summary__title">穿甲</span>
      {summaries.map((summary) => (
        <span
          className="ap-chip"
          key={`${summary.componentLabel ?? "same"}-${summary.value ?? summary.minValue}`}
          title={apSummaryText(summary)}
        >
          <span className="ap-shield" aria-hidden="true" />
          <span>
            {summary.componentLabel ? `${summary.componentLabel} ` : ""}
            {summary.minValue !== undefined &&
            summary.maxValue !== undefined &&
            summary.minValue !== summary.maxValue
              ? `${summary.minValue}–${summary.maxValue}`
              : (summary.value ?? summary.minValue)}{" "}
            · {summary.labelZh}
          </span>
        </span>
      ))}
      {allCount > 3 && <span className="ap-more">+{allCount - 3} 详情</span>}
    </div>
  );
}

export function AnglePenetrationDetails({
  component,
}: {
  component: AttackComponent;
}) {
  const angles = component.fields.anglePenetration;
  if (!angles) return null;
  return (
    <dl className="angle-stats">
      {Object.entries(angles).map(([angle, value]) => (
        <div key={angle}>
          <dt>
            {angle === "direct"
              ? "直击"
              : angle === "slight"
                ? "小角度"
                : angle === "large"
                  ? "大角度"
                  : "极端角度"}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
