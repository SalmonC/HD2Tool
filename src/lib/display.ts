import type {
  AttackComponent,
  AttackFields,
  Equipment,
  ProductKind,
} from "../types";

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  "primary-weapon": "主武器",
  "secondary-weapon": "副武器",
  "support-weapon": "支援武器",
  grenade: "手雷",
  "body-armor": "护甲",
  "other-stratagem": "战备",
};

const WEAPON_TYPE_LABELS: Record<string, string> = {
  "Anti-Armor Precision": "精确反装甲",
  "Anti-Tank": "反坦克",
  "Assault Rifles": "突击步枪",
  Shotguns: "霰弹枪",
  "Marksman Rifles": "精确射手步枪",
  "Submachine Guns": "冲锋枪",
  "Energy-Based": "能量武器",
  Explosives: "爆炸武器",
  Explosive: "爆炸武器",
  "Heavy Energy-Based": "重型能量武器",
  "Heavy Explosive": "重型爆炸武器",
  "Heavy Explosives": "重型爆炸武器",
  Incendiary: "燃烧武器",
  Melee: "近战武器",
  Missiles: "导弹武器",
  "Rocket Launcher": "火箭发射器",
  Standard: "常规武器",
  "Stun Tesla": "电击特斯拉",
  Special: "特殊武器",
  Pistols: "手枪",
  "Heavy Weapons": "重型武器",
  "Melee Weapons": "近战武器",
  Grenades: "手雷",
};

const COMPONENT_LABELS: Record<string, string> = {
  projectile: "直击",
  shrapnel: "弹片",
  explosion: "爆炸",
  spray: "喷射",
  melee: "近战",
  charge: "蓄力",
  alternate: "替代模式",
  status: "状态",
  other: "其他",
  Ballistic: "弹道",
  Explosion: "爆炸",
  "Impact Explosion": "冲击爆炸",
  Fire: "火焰",
  Gas: "毒气",
  Arc: "电弧",
  Laser: "激光",
  Plasma: "等离子",
};

const PASSIVE_LABELS: Record<string, string> = {
  "Feet First": "脚先着地",
  Acclimated: "环境适应",
  "Adreno-Defibrillator": "肾上腺除颤器",
  "Advanced Filtration": "高级过滤",
  "Ballistic Padding": "防弹衬垫",
  "Concussive Padding, Grenadier": "震荡衬垫·掷弹兵",
  "Concussive Padding, Hazmat": "震荡衬垫·防化",
  "Concussive Padding, Reinforced": "震荡衬垫·强化",
  "Desert Stormer": "沙漠突击者",
  "Electrical Conduit": "电气导管",
  "Standard Issue": "标准配发",
  "Extra Padding": "额外垫料",
  "Democracy Protects": "民主护佑",
  "Engineering Kit": "工程套件",
  Fortified: "强化装甲",
  "Med-Kit": "医疗套件",
  Scout: "侦察",
  "Servo-Assisted": "伺服辅助",
  "Peak Physique": "巅峰体格",
  Gunslinger: "枪手",
  Inflammable: "耐燃",
  "Integrated Explosives": "集成炸药",
  "Kinetic Displacement Mitigation": "动能缓冲",
  Oxygenator: "供氧装置",
  "Reduced Signature": "低可探测特征",
  "Reinforced Epaulettes": "强化肩甲",
  "Rock Solid": "岿然不动",
  "Siege-Ready": "攻城就绪",
  "Supplementary Adrenaline": "补充肾上腺素",
  Unflinching: "坚定不移",
  "True Grit": "坚韧不拔",
};

const DEPLOYMENT_TYPE_LABELS: Record<string, string> = {
  Backpack: "背包",
  Eagle: "飞鹰",
  Emplacement: "阵地设施",
  Orbital: "轨道",
  Other: "其他",
  Sentry: "哨戒炮",
  "Support Weapon": "支援武器",
  Vehicle: "载具",
};

export function weaponTypeLabel(value?: string): string | undefined {
  return value ? (WEAPON_TYPE_LABELS[value] ?? value) : undefined;
}

export function componentLabel(component: AttackComponent): string {
  const base =
    COMPONENT_LABELS[component.type] ??
    COMPONENT_LABELS[component.label] ??
    component.label;
  return component.chargeLevel ? `${base} · ${component.chargeLevel}` : base;
}

export function passiveLabel(value?: string): string | undefined {
  return value ? (PASSIVE_LABELS[value] ?? value) : undefined;
}

export function deploymentTypeLabel(value?: string): string | undefined {
  return value ? (DEPLOYMENT_TYPE_LABELS[value] ?? value) : undefined;
}

export function armorPenetrationText(
  component: AttackComponent,
): string | undefined {
  const ap = component.fields.armorPenetration;
  if (!ap) return undefined;
  const value =
    ap.value !== undefined
      ? String(ap.value)
      : ap.minValue !== undefined || ap.maxValue !== undefined
        ? `${ap.minValue ?? "?"}–${ap.maxValue ?? "?"}`
        : undefined;
  return value ? `${value}${ap.labelZh ? ` · ${ap.labelZh}` : ""}` : undefined;
}

export function radiusText(fields: AttackFields): string | undefined {
  if (fields.innerRadius !== undefined && fields.outerRadius !== undefined)
    return `${fields.innerRadius}–${fields.outerRadius} 米`;
  if (fields.innerRadius !== undefined)
    return `内半径 ${fields.innerRadius} 米`;
  if (fields.outerRadius !== undefined)
    return `外半径 ${fields.outerRadius} 米`;
  return undefined;
}

export function apText(component: AttackComponent): string | undefined {
  const value = armorPenetrationText(component);
  return value ? `${componentLabel(component)} ${value}` : undefined;
}

export function demolitionText(component: AttackComponent): string | undefined {
  return component.fields.demolitionForce === undefined
    ? undefined
    : `${componentLabel(component)} ${component.fields.demolitionForce}`;
}

export function apSummaries(item: Equipment): string[] {
  return [
    ...new Set(
      item.combat?.components
        .map(apText)
        .filter((value): value is string => Boolean(value)) ?? [],
    ),
  ];
}

export function demolitionSummaries(item: Equipment): string[] {
  return [
    ...new Set(
      item.combat?.components
        .map(demolitionText)
        .filter((value): value is string => Boolean(value)) ?? [],
    ),
  ];
}

export function hasDisplayableCombatFields(
  component: AttackComponent,
): boolean {
  const fields = component.fields;
  return [
    fields.standardDamage,
    fields.durableDamage,
    fields.dps,
    armorPenetrationText(component),
    fields.demolitionForce,
    fields.stagger,
    fields.push,
    fields.innerRadius,
    fields.outerRadius,
  ].some((value) => value !== undefined && value !== null && value !== "");
}

export function displayableCombatComponents(
  item: Equipment,
): AttackComponent[] {
  const seen = new Set<string>();
  return (item.combat?.components ?? []).filter((component) => {
    if (!hasDisplayableCombatFields(component)) return false;
    const visibleKey = JSON.stringify({
      label: componentLabel(component),
      standardDamage: component.fields.standardDamage,
      durableDamage: component.fields.durableDamage,
      dps: component.fields.dps,
      armorPenetration: armorPenetrationText(component),
      demolitionForce: component.fields.demolitionForce,
      stagger: component.fields.stagger,
      push: component.fields.push,
      innerRadius: component.fields.innerRadius,
      outerRadius: component.fields.outerRadius,
    });
    if (seen.has(visibleKey)) return false;
    seen.add(visibleKey);
    return true;
  });
}
