import type {
  Catalog,
  Equipment,
  SourceRef,
  Taxonomy,
  TaxonomyDimension,
  WeaponProfile,
  WeaponDimension,
} from "../types";
import { normalizeSearchText } from "./normalize";

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function issue(
  issues: ValidationIssue[],
  code: string,
  message: string,
  path?: string,
  severity: ValidationIssue["severity"] = "error",
) {
  issues.push({ code, message, path, severity });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasSources(value: unknown): value is SourceRef[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.label === "string" &&
        typeof entry.kind === "string",
    )
  );
}

function hasTrustedSource(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        isRecord(entry) &&
        ["game-data", "official", "wiki", "community", "manual"].includes(
          String(entry.kind),
        ),
    )
  );
}

function checkMoney(value: unknown, path: string, issues: ValidationIssue[]) {
  if (
    value !== null &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0)
  ) {
    issue(
      issues,
      "negative-or-invalid-price",
      "价格必须是非负数字或 null。",
      path,
    );
  }
}

const WEAPON_DIMENSIONS: ReadonlySet<WeaponDimension> = new Set([
  "weaponType",
  "ammoTraits",
  "armorPenetration",
  "demolitionPower",
]);
const EXPECTED_TAXONOMY_KINDS: Record<
  WeaponDimension,
  TaxonomyDimension["valueKind"]
> = {
  weaponType: "single",
  ammoTraits: "multi",
  armorPenetration: "number",
  demolitionPower: "number",
};
const ACQUISITION_KINDS = new Set([
  "warbond",
  "requisition",
  "default",
  "superstore",
  "edition",
  "event",
  "unavailable",
  "other",
]);

function checkVerifiedField(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  dimension: TaxonomyDimension | undefined,
  checkValue: (
    fieldValue: unknown,
    dimension: TaxonomyDimension | undefined,
    status: "verified" | "pending",
  ) => void,
): void {
  if (!isRecord(value)) {
    issue(
      issues,
      "invalid-weapon-profile-field",
      "武器属性字段必须是带 value/taxonomySource/scaleVersion/sourceRefs/verificationStatus 的对象。",
      path,
    );
    return;
  }
  if (!hasSources(value.sourceRefs))
    issue(
      issues,
      "missing-weapon-profile-source",
      "武器属性字段必须有独立来源记录。",
      `${path}.sourceRefs`,
    );
  if (
    value.verificationStatus === "verified" &&
    !hasTrustedSource(value.sourceRefs)
  )
    issue(
      issues,
      "untrusted-verified-source",
      "已核验武器属性不能只引用项目样例来源。",
      `${path}.sourceRefs`,
    );
  if (
    value.verificationStatus !== "verified" &&
    value.verificationStatus !== "pending"
  )
    issue(
      issues,
      "invalid-weapon-profile-status",
      "武器属性字段核验状态必须是 verified 或 pending。",
      `${path}.verificationStatus`,
    );
  const status =
    value.verificationStatus === "verified" ? "verified" : "pending";
  if (
    typeof value.taxonomySource !== "string" ||
    value.taxonomySource.trim() === ""
  )
    issue(
      issues,
      "missing-taxonomy-source",
      "武器属性字段必须记录 taxonomySource。",
      `${path}.taxonomySource`,
    );
  if (
    typeof value.scaleVersion !== "string" ||
    value.scaleVersion.trim() === ""
  )
    issue(
      issues,
      "missing-scale-version",
      "武器属性字段必须记录 scaleVersion。",
      `${path}.scaleVersion`,
    );
  if (dimension) {
    if (value.taxonomySource !== dimension.taxonomySource)
      issue(
        issues,
        "taxonomy-source-mismatch",
        "字段 taxonomySource 与当前 taxonomy 不一致。",
        `${path}.taxonomySource`,
      );
    if (value.scaleVersion !== dimension.scaleVersion)
      issue(
        issues,
        "scale-version-mismatch",
        "字段 scaleVersion 与当前 taxonomy 不一致。",
        `${path}.scaleVersion`,
      );
  } else {
    issue(
      issues,
      status === "verified"
        ? "missing-taxonomy-definition"
        : "pending-taxonomy-value",
      "当前没有可靠的统一 taxonomy 定义；字段只能保持待核验，不能进入筛选。",
      path,
      status === "verified" ? "error" : "warning",
    );
  }
  checkValue(value.value, dimension, status);
}

function checkTaxonomyOption(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    typeof value.labelZh !== "string" ||
    value.labelZh.trim() === ""
  ) {
    issue(
      issues,
      "invalid-taxonomy-option",
      "taxonomy 选项必须有稳定 ID 和简中标签。",
      path,
    );
    return;
  }
  if (!hasSources(value.sourceRefs))
    issue(
      issues,
      "missing-taxonomy-option-source",
      "taxonomy 选项必须有来源记录。",
      `${path}.sourceRefs`,
    );
  if (
    value.verificationStatus === "verified" &&
    !hasTrustedSource(value.sourceRefs)
  )
    issue(
      issues,
      "untrusted-verified-taxonomy-source",
      "已核验 taxonomy 不能只引用项目样例来源。",
      `${path}.sourceRefs`,
    );
  if (
    !["verified", "pending", "sample"].includes(
      String(value.verificationStatus),
    )
  )
    issue(
      issues,
      "invalid-taxonomy-option-status",
      "taxonomy 选项核验状态无效。",
      `${path}.verificationStatus`,
    );
}

function checkTaxonomy(
  value: unknown,
  issues: ValidationIssue[],
): value is Taxonomy {
  if (
    !isRecord(value) ||
    typeof value.version !== "string" ||
    !isRecord(value.dimensions)
  ) {
    issue(
      issues,
      "invalid-taxonomy",
      "数据必须包含版本化 taxonomy 及 dimensions。",
      "taxonomy",
    );
    return false;
  }
  for (const [key, dimension] of Object.entries(value.dimensions)) {
    if (
      !WEAPON_DIMENSIONS.has(key as WeaponDimension) ||
      !isRecord(dimension)
    ) {
      issue(
        issues,
        "invalid-taxonomy-dimension",
        `未知 taxonomy 维度：${key}。`,
        `taxonomy.dimensions.${key}`,
      );
      continue;
    }
    const path = `taxonomy.dimensions.${key}`;
    if (
      dimension.id !== key ||
      typeof dimension.labelZh !== "string" ||
      typeof dimension.taxonomySource !== "string" ||
      typeof dimension.scaleVersion !== "string"
    )
      issue(
        issues,
        "invalid-taxonomy-dimension",
        "taxonomy 维度缺少 id、标签、来源或标尺版本。",
        path,
      );
    if (!["single", "multi", "number"].includes(String(dimension.valueKind)))
      issue(
        issues,
        "invalid-taxonomy-kind",
        "taxonomy valueKind 无效。",
        `${path}.valueKind`,
      );
    if (dimension.valueKind !== EXPECTED_TAXONOMY_KINDS[key as WeaponDimension])
      issue(
        issues,
        "taxonomy-kind-mismatch",
        `${key} 的 taxonomy valueKind 必须是 ${EXPECTED_TAXONOMY_KINDS[key as WeaponDimension]}。`,
        `${path}.valueKind`,
      );
    if (!hasSources(dimension.sourceRefs))
      issue(
        issues,
        "missing-taxonomy-source",
        "taxonomy 维度必须有来源记录。",
        `${path}.sourceRefs`,
      );
    if (
      dimension.verificationStatus === "verified" &&
      !hasTrustedSource(dimension.sourceRefs)
    )
      issue(
        issues,
        "untrusted-verified-taxonomy-source",
        "已核验 taxonomy 不能只引用项目样例来源。",
        `${path}.sourceRefs`,
      );
    if (
      !["verified", "pending", "sample"].includes(
        String(dimension.verificationStatus),
      )
    )
      issue(
        issues,
        "invalid-taxonomy-status",
        "taxonomy 维度核验状态无效。",
        `${path}.verificationStatus`,
      );
    if (!Array.isArray(dimension.options))
      issue(
        issues,
        "invalid-taxonomy-options",
        "taxonomy options 必须是数组。",
        `${path}.options`,
      );
    if (Array.isArray(dimension.options)) {
      const optionIds = new Set<string>();
      dimension.options.forEach((option, index) => {
        checkTaxonomyOption(option, `${path}.options[${index}]`, issues);
        if (isRecord(option) && typeof option.id === "string") {
          if (optionIds.has(option.id))
            issue(
              issues,
              "duplicate-taxonomy-option",
              `重复 taxonomy 选项：${option.id}。`,
              `${path}.options[${index}].id`,
            );
          optionIds.add(option.id);
        }
      });
    }
    if (
      dimension.valueKind === "number" &&
      dimension.numberScale !== undefined
    ) {
      const scale = dimension.numberScale;
      if (
        !isRecord(scale) ||
        typeof scale.min !== "number" ||
        typeof scale.max !== "number" ||
        typeof scale.step !== "number" ||
        scale.step <= 0 ||
        scale.max < scale.min
      )
        issue(
          issues,
          "invalid-taxonomy-scale",
          "数值 taxonomy 标尺必须有有效的 min/max/step。",
          `${path}.numberScale`,
        );
      if (
        isRecord(scale) &&
        key === "demolitionPower" &&
        dimension.verificationStatus === "verified" &&
        (scale.min !== 0 || scale.max !== 50 || scale.step !== 1)
      )
        issue(
          issues,
          "demolition-power-scale-migration-required",
          "demolitionPower 当前标尺必须是整数 0..50；变更必须通过 taxonomy 版本迁移。",
          `${path}.numberScale`,
        );
    }
  }
  return true;
}

function checkTaxonomyValue(
  fieldValue: unknown,
  dimension: TaxonomyDimension | undefined,
  status: "verified" | "pending",
  path: string,
  issues: ValidationIssue[],
): void {
  if (!dimension) return;
  const optionIds = new Set(dimension.options.map((option) => option.id));
  const reportUnknown = (unknownValue: string) =>
    issue(
      issues,
      status === "verified"
        ? "unknown-taxonomy-value"
        : "pending-unknown-taxonomy-value",
      `taxonomy 中不存在值：${unknownValue}。`,
      path,
      status === "verified" ? "error" : "warning",
    );
  if (dimension.valueKind === "single" && typeof fieldValue === "string") {
    if (!optionIds.has(fieldValue)) reportUnknown(fieldValue);
  } else if (dimension.valueKind === "multi" && Array.isArray(fieldValue)) {
    fieldValue
      .filter((entry): entry is string => typeof entry === "string")
      .forEach((entry) => {
        if (!optionIds.has(entry)) reportUnknown(entry);
      });
  } else if (
    dimension.valueKind === "number" &&
    typeof fieldValue === "number"
  ) {
    if (!Number.isFinite(fieldValue))
      issue(
        issues,
        "invalid-taxonomy-number",
        "数值字段必须是有限数字。",
        path,
      );
    if (
      dimension.id === "demolitionPower" &&
      (!Number.isInteger(fieldValue) || fieldValue < 0 || fieldValue > 50)
    )
      issue(
        issues,
        "demolition-power-out-of-contract",
        "demolitionPower 必须是整数 0..50。",
        path,
      );
    if (dimension.numberScale) {
      const { min, max, step } = dimension.numberScale;
      if (
        fieldValue < min ||
        fieldValue > max ||
        Math.abs(
          (fieldValue - min) / step - Math.round((fieldValue - min) / step),
        ) > 1e-8
      )
        issue(
          issues,
          "taxonomy-number-out-of-scale",
          "数值不符合当前 taxonomy 的标尺。",
          path,
        );
    } else if (status === "verified") {
      issue(
        issues,
        "missing-taxonomy-scale",
        "没有明确数值标尺时不能核验或进入筛选。",
        path,
      );
    }
  } else {
    issue(
      issues,
      "taxonomy-value-kind-mismatch",
      "字段值类型与 taxonomy 维度不一致。",
      path,
      status === "verified" ? "error" : "warning",
    );
  }
}

function checkWeaponProfile(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  taxonomy: Taxonomy | undefined,
): value is WeaponProfile {
  if (!isRecord(value)) {
    issue(issues, "invalid-weapon-profile", "weaponProfile 必须是对象。", path);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (
      ![
        "weaponType",
        "ammoTraits",
        "armorPenetration",
        "demolitionPower",
      ].includes(key)
    )
      issue(
        issues,
        "unknown-weapon-profile-field",
        `未知武器属性字段：${key}。`,
        `${path}.${key}`,
      );
  }
  if (value.weaponType !== undefined) {
    const dimension = taxonomy?.dimensions.weaponType;
    checkVerifiedField(
      value.weaponType,
      `${path}.weaponType`,
      issues,
      dimension,
      (fieldValue, currentDimension, status) =>
        checkTaxonomyValue(
          fieldValue,
          currentDimension,
          status,
          `${path}.weaponType.value`,
          issues,
        ),
    );
  }
  if (value.ammoTraits !== undefined) {
    const dimension = taxonomy?.dimensions.ammoTraits;
    checkVerifiedField(
      value.ammoTraits,
      `${path}.ammoTraits`,
      issues,
      dimension,
      (fieldValue, currentDimension, status) => {
        if (!Array.isArray(fieldValue) || fieldValue.length === 0)
          issue(
            issues,
            "invalid-ammo-trait",
            "ammoTraits 必须是非空多标签数组，具体值来自 taxonomy。",
            `${path}.ammoTraits.value`,
          );
        else if (new Set(fieldValue).size !== fieldValue.length)
          issue(
            issues,
            "duplicate-ammo-trait",
            "ammoTraits 不得重复同一标签。",
            `${path}.ammoTraits.value`,
          );
        checkTaxonomyValue(
          fieldValue,
          currentDimension,
          status,
          `${path}.ammoTraits.value`,
          issues,
        );
      },
    );
  }
  if (value.armorPenetration !== undefined) {
    const dimension = taxonomy?.dimensions.armorPenetration;
    checkVerifiedField(
      value.armorPenetration,
      `${path}.armorPenetration`,
      issues,
      dimension,
      (fieldValue, currentDimension, status) =>
        checkTaxonomyValue(
          fieldValue,
          currentDimension,
          status,
          `${path}.armorPenetration.value`,
          issues,
        ),
    );
  }
  if (value.demolitionPower !== undefined) {
    const dimension = taxonomy?.dimensions.demolitionPower;
    checkVerifiedField(
      value.demolitionPower,
      `${path}.demolitionPower`,
      issues,
      dimension,
      (fieldValue, currentDimension, status) =>
        checkTaxonomyValue(
          fieldValue,
          currentDimension,
          status,
          `${path}.demolitionPower.value`,
          issues,
        ),
    );
  }
  return true;
}

function checkItem(
  item: unknown,
  index: number,
  warbondIds: Set<string>,
  issues: ValidationIssue[],
  taxonomy: Taxonomy | undefined,
): item is Equipment {
  const path = `items[${index}]`;
  if (!isRecord(item)) {
    issue(issues, "invalid-item", "装备条目必须是对象。", path);
    return false;
  }
  for (const field of [
    "id",
    "model",
    "nameZh",
    "nameEn",
    "category",
    "notes",
  ]) {
    if (typeof item[field] !== "string" || item[field].trim() === "")
      issue(issues, "missing-field", `缺少 ${field}。`, `${path}.${field}`);
  }
  if (
    !["weapon", "armor", "stratagem", "grenade", "booster"].includes(
      String(item.category),
    )
  )
    issue(issues, "invalid-category", "装备类别无效。", `${path}.category`);
  if (
    !["verified", "pending", "sample"].includes(String(item.verificationStatus))
  )
    issue(
      issues,
      "invalid-item-status",
      "装备核验状态无效。",
      `${path}.verificationStatus`,
    );
  if (!hasSources(item.sourceRefs))
    issue(
      issues,
      "missing-source",
      "装备必须至少有一个来源记录。",
      `${path}.sourceRefs`,
    );
  if (
    item.verificationStatus === "verified" &&
    !hasTrustedSource(item.sourceRefs)
  )
    issue(
      issues,
      "untrusted-item-source",
      "已核验装备不能只引用项目样例来源。",
      `${path}.sourceRefs`,
    );
  if (
    !isRecord(item.image) ||
    typeof item.image.path !== "string" ||
    typeof item.image.alt !== "string" ||
    !["placeholder", "candidate", "verified"].includes(
      String(item.image.status),
    ) ||
    (item.image.originalPage !== null &&
      typeof item.image.originalPage !== "string") ||
    (item.image.author !== null && typeof item.image.author !== "string") ||
    typeof item.image.syncedAt !== "string" ||
    (item.image.fileHash !== null && typeof item.image.fileHash !== "string") ||
    !["project-created-placeholder", "pending", "documented"].includes(
      String(item.image.licenseStatus),
    ) ||
    !hasSources(item.image.sourceRefs)
  ) {
    issue(
      issues,
      "missing-image-record",
      "装备必须有本地图片路径和图片来源记录。",
      `${path}.image`,
    );
  }
  if (
    isRecord(item.image) &&
    item.image.status === "verified" &&
    (!hasTrustedSource(item.image.sourceRefs) ||
      item.image.licenseStatus !== "documented")
  )
    issue(
      issues,
      "untrusted-image-source",
      "已核验图片必须有可信来源和 documented 许可状态。",
      `${path}.image`,
    );
  if (item.category !== "weapon" && item.weaponProfile !== undefined)
    issue(
      issues,
      "non-weapon-profile",
      "非武器条目禁止出现 weaponProfile。",
      `${path}.weaponProfile`,
    );
  if (item.category === "weapon" && item.weaponProfile !== undefined)
    checkWeaponProfile(
      item.weaponProfile,
      `${path}.weaponProfile`,
      issues,
      taxonomy,
    );
  if (!Array.isArray(item.aliases))
    issue(issues, "invalid-aliases", "aliases 必须是数组。", `${path}.aliases`);
  if (
    !isRecord(item.acquisition) ||
    typeof item.acquisition.kind !== "string"
  ) {
    issue(
      issues,
      "invalid-acquisition",
      "获取方式缺少 kind。",
      `${path}.acquisition`,
    );
  } else {
    const acquisition = item.acquisition;
    const acquisitionKind =
      typeof acquisition.kind === "string" ? acquisition.kind : "";
    if (!ACQUISITION_KINDS.has(acquisitionKind))
      issue(
        issues,
        "invalid-acquisition-kind",
        `未知获取方式：${acquisition.kind}。`,
        `${path}.acquisition.kind`,
      );
    if (acquisition.kind === "warbond") {
      if (
        typeof acquisition.warbondId !== "string" ||
        !warbondIds.has(acquisition.warbondId)
      )
        issue(
          issues,
          "dangling-warbond",
          "债券引用不存在。",
          `${path}.acquisition.warbondId`,
        );
      const page = acquisition.page;
      if (
        page !== null &&
        (typeof page !== "number" || !Number.isInteger(page) || page < 1)
      )
        issue(
          issues,
          "invalid-page",
          "债券页码必须是正整数或 null。",
          `${path}.acquisition.page`,
        );
      checkMoney(
        acquisition.itemMedals,
        `${path}.acquisition.itemMedals`,
        issues,
      );
      checkMoney(
        acquisition.pageUnlockMedals,
        `${path}.acquisition.pageUnlockMedals`,
        issues,
      );
    }
    if (acquisition.kind === "requisition") {
      checkMoney(
        acquisition.levelRequired,
        `${path}.acquisition.levelRequired`,
        issues,
      );
      checkMoney(
        acquisition.requisitionPoints,
        `${path}.acquisition.requisitionPoints`,
        issues,
      );
    }
    if (acquisition.kind === "superstore")
      checkMoney(
        acquisition.superCredits,
        `${path}.acquisition.superCredits`,
        issues,
      );
    if (acquisition.kind === "edition") {
      if (
        typeof acquisition.editionName !== "string" ||
        acquisition.editionName.trim() === ""
      )
        issue(
          issues,
          "invalid-edition",
          "版本奖励必须有版本名称。",
          `${path}.acquisition.editionName`,
        );
      checkMoney(acquisition.price, `${path}.acquisition.price`, issues);
      if (
        !["available", "unavailable", "pending"].includes(
          String(acquisition.status),
        )
      )
        issue(
          issues,
          "invalid-edition-status",
          "版本奖励状态无效。",
          `${path}.acquisition.status`,
        );
    }
    if (acquisition.kind === "event") {
      if (
        typeof acquisition.eventName !== "string" ||
        acquisition.eventName.trim() === ""
      )
        issue(
          issues,
          "invalid-event",
          "活动获取必须有活动名称。",
          `${path}.acquisition.eventName`,
        );
      if (
        !["available", "ended", "pending"].includes(String(acquisition.status))
      )
        issue(
          issues,
          "invalid-event-status",
          "活动状态无效。",
          `${path}.acquisition.status`,
        );
    }
    if (acquisition.kind === "other") {
      if (
        typeof acquisition.label !== "string" ||
        acquisition.label.trim() === ""
      )
        issue(
          issues,
          "invalid-other-acquisition",
          "其他获取方式必须有来源标签。",
          `${path}.acquisition.label`,
        );
      if (
        !["available", "unavailable", "pending"].includes(
          String(acquisition.status),
        )
      )
        issue(
          issues,
          "invalid-other-status",
          "其他获取方式状态无效。",
          `${path}.acquisition.status`,
        );
    }
  }
  return true;
}

export function validateCatalog(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value))
    return {
      ok: false,
      issues: [
        {
          code: "invalid-root",
          message: "数据根节点必须是对象。",
          severity: "error",
        },
      ],
    };
  if (!isRecord(value.meta))
    issue(issues, "missing-meta", "数据必须包含 meta。", "meta");
  const taxonomy = checkTaxonomy(value.taxonomy, issues)
    ? value.taxonomy
    : undefined;
  if (!Array.isArray(value.warbonds))
    issue(issues, "invalid-warbonds", "warbonds 必须是数组。", "warbonds");
  if (!Array.isArray(value.items))
    issue(issues, "invalid-items", "items 必须是数组。", "items");
  if (!Array.isArray(value.glossaryTerms))
    issue(
      issues,
      "invalid-glossary",
      "glossaryTerms 必须是数组。",
      "glossaryTerms",
    );
  if (
    !Array.isArray(value.warbonds) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.glossaryTerms)
  )
    return { ok: false, issues };

  const warbondIds = new Set<string>();
  value.warbonds.forEach((warbond, index) => {
    if (!isRecord(warbond) || typeof warbond.id !== "string") {
      issue(
        issues,
        "invalid-warbond",
        "债券缺少稳定 ID。",
        `warbonds[${index}]`,
      );
      return;
    }
    if (warbondIds.has(warbond.id))
      issue(
        issues,
        "duplicate-warbond-id",
        `重复债券 ID：${warbond.id}。`,
        `warbonds[${index}].id`,
      );
    warbondIds.add(warbond.id);
    checkMoney(warbond.superCredits, `warbonds[${index}].superCredits`, issues);
    if (!hasSources(warbond.sourceRefs))
      issue(
        issues,
        "missing-source",
        "债券必须至少有一个来源记录。",
        `warbonds[${index}].sourceRefs`,
      );
    if (
      warbond.verificationStatus === "verified" &&
      !hasTrustedSource(warbond.sourceRefs)
    )
      issue(
        issues,
        "untrusted-warbond-source",
        "已核验债券不能只引用项目样例来源。",
        `warbonds[${index}].sourceRefs`,
      );
  });

  const ids = new Set<string>();
  const formalNames = new Set<string>();
  const aliases = new Map<string, string>();
  value.items.forEach((item, index) => {
    if (isRecord(item) && typeof item.id === "string") {
      if (ids.has(item.id))
        issue(
          issues,
          "duplicate-id",
          `重复装备 ID：${item.id}。`,
          `items[${index}].id`,
        );
      ids.add(item.id);
      if (typeof item.nameZh === "string") {
        const normalizedName = normalizeSearchText(item.nameZh);
        if (formalNames.has(normalizedName))
          issue(
            issues,
            "duplicate-formal-name",
            `重复正式名：${item.nameZh}。`,
            `items[${index}].nameZh`,
          );
        formalNames.add(normalizedName);
      }
      if (Array.isArray(item.aliases)) {
        item.aliases.forEach((alias, aliasIndex) => {
          if (!isRecord(alias) || typeof alias.text !== "string") return;
          const normalizedAlias = normalizeSearchText(alias.text);
          const priorId = aliases.get(normalizedAlias);
          if (priorId && priorId !== item.id)
            issue(
              issues,
              "alias-conflict",
              `外号“${alias.text}”同时指向 ${priorId} 与 ${item.id}。`,
              `items[${index}].aliases[${aliasIndex}]`,
            );
          aliases.set(normalizedAlias, item.id as string);
          if (!hasSources(alias.sourceRefs))
            issue(
              issues,
              "missing-alias-source",
              "外号必须有来源记录。",
              `items[${index}].aliases[${aliasIndex}].sourceRefs`,
            );
          if (
            alias.reviewStatus === "verified" &&
            !hasTrustedSource(alias.sourceRefs)
          )
            issue(
              issues,
              "untrusted-alias-source",
              "已核验外号不能只引用项目样例来源。",
              `items[${index}].aliases[${aliasIndex}].sourceRefs`,
            );
        });
      }
    }
    checkItem(item, index, warbondIds, issues, taxonomy);
  });

  const glossaryIds = new Set<string>();
  const glossaryAliases = new Set<string>();
  value.glossaryTerms.forEach((term, index) => {
    const path = `glossaryTerms[${index}]`;
    if (!isRecord(term)) {
      issue(issues, "invalid-glossary-term", "术语必须是对象。", path);
      return;
    }
    if (typeof term.id !== "string" || term.id.trim() === "")
      issue(issues, "invalid-glossary-id", "术语缺少稳定 ID。", `${path}.id`);
    else if (glossaryIds.has(term.id))
      issue(
        issues,
        "duplicate-glossary-id",
        `重复术语 ID：${term.id}。`,
        `${path}.id`,
      );
    else glossaryIds.add(term.id);
    if (
      typeof term.titleZh !== "string" ||
      typeof term.description !== "string" ||
      !Array.isArray(term.aliases) ||
      term.aliases.length === 0 ||
      !Array.isArray(term.examples) ||
      !hasSources(term.sourceRefs) ||
      !["verified", "pending"].includes(String(term.verificationStatus))
    )
      issue(issues, "invalid-glossary-term", "术语记录字段不完整。", path);
    if (Array.isArray(term.aliases))
      term.aliases.forEach((alias) => {
        if (typeof alias !== "string" || alias.trim() === "") {
          issue(
            issues,
            "invalid-glossary-alias",
            "术语俗称不能为空。",
            `${path}.aliases`,
          );
          return;
        }
        const normalized = normalizeSearchText(alias);
        if (glossaryAliases.has(normalized))
          issue(
            issues,
            "duplicate-glossary-alias",
            `重复术语俗称：${alias}。`,
            `${path}.aliases`,
          );
        glossaryAliases.add(normalized);
      });
  });

  return { ok: issues.every((entry) => entry.severity !== "error"), issues };
}

export function assertValidCatalog(value: unknown): asserts value is Catalog {
  const result = validateCatalog(value);
  if (!result.ok)
    throw new Error(
      result.issues
        .map((entry) => `${entry.code}: ${entry.message}`)
        .join("\n"),
    );
}
