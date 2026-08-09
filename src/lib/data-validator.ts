import type { Catalog } from "../types";
import { normalizeSearchText } from "./normalize";

export interface ValidationIssue {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
}
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const dimensions = new Set([
  "weaponType",
  "ammoTraits",
  "armorPenetration",
  "demolitionPower",
]);
const acquisitionKinds = new Set([
  "warbond",
  "requisition",
  "default",
  "superstore",
  "edition",
  "event",
  "poi",
  "unavailable",
  "other",
]);
const categories = new Set([
  "weapon",
  "armor",
  "stratagem",
  "grenade",
  "booster",
]);
const statuses = new Set(["verified", "pending", "sample"]);
const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null;
const hasSources = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (source) =>
      isRecord(source) &&
      typeof source.kind === "string" &&
      typeof source.label === "string",
  );
const add = (
  issues: ValidationIssue[],
  code: string,
  message: string,
  path: string,
  severity: "error" | "warning" = "error",
) => issues.push({ code, message, path, severity });

function checkTaxonomy(
  value: unknown,
  issues: ValidationIssue[],
): Map<string, any> {
  const checked = new Map<string, any>();
  if (
    !isRecord(value) ||
    typeof value.version !== "string" ||
    !isRecord(value.dimensions)
  ) {
    add(
      issues,
      "invalid-taxonomy",
      "taxonomy needs a version and dimensions.",
      "taxonomy",
    );
    return checked;
  }
  for (const [id, dimension] of Object.entries(value.dimensions)) {
    if (!dimensions.has(id) || !isRecord(dimension)) {
      add(
        issues,
        "unknown-taxonomy-dimension",
        `Unknown taxonomy dimension: ${id}`,
        `taxonomy.dimensions.${id}`,
      );
      continue;
    }
    checked.set(id, dimension);
    if (
      dimension.id !== id ||
      typeof dimension.taxonomySource !== "string" ||
      typeof dimension.scaleVersion !== "string" ||
      !["single", "multi", "number"].includes(dimension.valueKind) ||
      !hasSources(dimension.sourceRefs) ||
      !Array.isArray(dimension.options) ||
      !statuses.has(dimension.verificationStatus)
    )
      add(
        issues,
        "invalid-taxonomy-dimension",
        `Invalid taxonomy dimension: ${id}`,
        `taxonomy.dimensions.${id}`,
      );
    if (dimension.valueKind === "number") {
      const scale = dimension.numberScale;
      if (
        !isRecord(scale) ||
        ![scale.min, scale.max, scale.step].every(
          (v) => typeof v === "number" && Number.isFinite(v),
        ) ||
        scale.step <= 0 ||
        scale.max < scale.min
      )
        add(
          issues,
          "invalid-taxonomy-scale",
          `Invalid numeric scale: ${id}`,
          `taxonomy.dimensions.${id}.numberScale`,
        );
      if (
        (id === "demolitionPower" && isRecord(scale) && scale.min !== 0) ||
        (id === "demolitionPower" && isRecord(scale) && scale.max !== 60)
      )
        add(
          issues,
          "demolition-scale-migration-required",
          "demolitionPower uses the current Wiki 0..60 scale; migrate older scales explicitly.",
          `taxonomy.dimensions.${id}.numberScale`,
        );
    }
    const options = new Set<string>();
    for (const [index, option] of dimension.options.entries()) {
      if (
        !isRecord(option) ||
        typeof option.id !== "string" ||
        typeof option.labelZh !== "string" ||
        !hasSources(option.sourceRefs) ||
        !statuses.has(option.verificationStatus)
      )
        add(
          issues,
          "invalid-taxonomy-option",
          "Invalid taxonomy option.",
          `taxonomy.dimensions.${id}.options[${index}]`,
        );
      if (isRecord(option) && options.has(option.id))
        add(
          issues,
          "duplicate-taxonomy-option",
          `Duplicate option ${option.id}.`,
          `taxonomy.dimensions.${id}.options[${index}]`,
        );
      if (isRecord(option)) options.add(option.id);
    }
  }
  return checked;
}

function checkAcquisition(
  item: any,
  path: string,
  warbondIds: Set<string>,
  issues: ValidationIssue[],
) {
  const acquisition = item.acquisition;
  if (!isRecord(acquisition) || !acquisitionKinds.has(acquisition.kind)) {
    add(
      issues,
      "invalid-acquisition",
      "Invalid acquisition kind.",
      `${path}.acquisition`,
    );
    return;
  }
  if (acquisition.kind === "warbond") {
    if (!warbondIds.has(acquisition.warbondId))
      add(
        issues,
        "unknown-warbond",
        `Unknown warbond ${acquisition.warbondId}.`,
        `${path}.acquisition.warbondId`,
      );
    for (const field of ["page", "itemMedals", "pageUnlockMedals"])
      if (
        acquisition[field] !== null &&
        acquisition[field] !== undefined &&
        (!Number.isInteger(acquisition[field]) ||
          acquisition[field] < 0 ||
          (field === "page" && acquisition[field] < 1))
      )
        add(
          issues,
          "invalid-acquisition-number",
          `Invalid ${field}.`,
          `${path}.acquisition.${field}`,
        );
  }
  if (
    acquisition.kind === "requisition" &&
    acquisition.requisitionPoints !== null &&
    acquisition.requisitionPoints !== undefined &&
    (!Number.isInteger(acquisition.requisitionPoints) ||
      acquisition.requisitionPoints < 0)
  )
    add(
      issues,
      "invalid-acquisition-number",
      "Invalid requisition points.",
      `${path}.acquisition.requisitionPoints`,
    );
  if (
    acquisition.kind === "superstore" &&
    acquisition.superCredits !== null &&
    acquisition.superCredits !== undefined &&
    (!Number.isInteger(acquisition.superCredits) ||
      acquisition.superCredits < 0)
  )
    add(
      issues,
      "invalid-acquisition-number",
      "Invalid super credits.",
      `${path}.acquisition.superCredits`,
    );
  if (
    acquisition.kind === "edition" &&
    (!acquisition.editionName || typeof acquisition.editionName !== "string")
  )
    add(
      issues,
      "invalid-edition",
      "Edition name is required.",
      `${path}.acquisition`,
    );
  if (
    acquisition.kind === "event" &&
    (!acquisition.eventName || typeof acquisition.eventName !== "string")
  )
    add(
      issues,
      "invalid-event",
      "Event name is required.",
      `${path}.acquisition`,
    );
  if (
    acquisition.kind === "poi" &&
    (!acquisition.location || typeof acquisition.location !== "string")
  )
    add(
      issues,
      "invalid-poi-acquisition",
      "POI acquisition location is required.",
      `${path}.acquisition`,
    );
  if (
    acquisition.kind === "other" &&
    (!acquisition.label || typeof acquisition.label !== "string")
  )
    add(
      issues,
      "invalid-other-acquisition",
      "Other acquisition label is required.",
      `${path}.acquisition`,
    );
}

function checkWeaponProfile(
  item: any,
  path: string,
  taxonomy: Map<string, any>,
  issues: ValidationIssue[],
) {
  if (
    !["weapon", "stratagem"].includes(item.category) &&
    item.weaponProfile !== undefined
  )
    add(
      issues,
      "non-weapon-profile",
      "Only weapons and stratagems with weapon-backed data can carry weaponProfile.",
      `${path}.weaponProfile`,
    );
  if (!item.weaponProfile) return;
  for (const [fieldName, field] of Object.entries(item.weaponProfile)) {
    const dimension = taxonomy.get(fieldName);
    if (!dimensions.has(fieldName) || !dimension || !isRecord(field)) {
      add(
        issues,
        "unknown-weapon-profile-field",
        `No taxonomy for ${fieldName}.`,
        `${path}.weaponProfile.${fieldName}`,
      );
      continue;
    }
    if (
      !hasSources(field.sourceRefs) ||
      field.taxonomySource !== dimension.taxonomySource ||
      field.scaleVersion !== dimension.scaleVersion
    )
      add(
        issues,
        "weapon-profile-source-mismatch",
        "Field source and taxonomy version must match.",
        `${path}.weaponProfile.${fieldName}`,
      );
    if (!["verified", "pending"].includes(field.verificationStatus))
      add(
        issues,
        "invalid-field-verification",
        "Invalid field verification status.",
        `${path}.weaponProfile.${fieldName}`,
      );
    const optionIds = new Set(
      (dimension.options ?? []).map((option: any) => option.id),
    );
    const values =
      dimension.valueKind === "multi" ? field.value : [field.value];
    if (
      dimension.valueKind === "multi" &&
      (!Array.isArray(field.value) ||
        !field.value.length ||
        new Set(field.value).size !== field.value.length)
    )
      add(
        issues,
        "invalid-multi-value",
        "Multi taxonomy field must be a non-empty unique array.",
        `${path}.weaponProfile.${fieldName}`,
      );
    if (dimension.valueKind === "single" && typeof field.value !== "string")
      add(
        issues,
        "invalid-single-value",
        "Single taxonomy field must be a string.",
        `${path}.weaponProfile.${fieldName}`,
      );
    if (
      dimension.valueKind === "number" &&
      (typeof field.value !== "number" || !Number.isFinite(field.value))
    )
      add(
        issues,
        "invalid-number-value",
        "Numeric taxonomy field must be finite.",
        `${path}.weaponProfile.${fieldName}`,
      );
    if (dimension.valueKind !== "number")
      for (const entry of Array.isArray(values) ? values : [])
        if (!optionIds.has(entry))
          add(
            issues,
            field.verificationStatus === "pending"
              ? "pending-unknown-taxonomy-value"
              : "unknown-taxonomy-value",
            `Unknown taxonomy value: ${entry}.`,
            `${path}.weaponProfile.${fieldName}`,
            field.verificationStatus === "pending" ? "warning" : "error",
          );
    if (
      dimension.valueKind === "number" &&
      typeof field.value === "number" &&
      dimension.numberScale &&
      (field.value < dimension.numberScale.min ||
        field.value > dimension.numberScale.max ||
        Math.abs(
          (field.value - dimension.numberScale.min) /
            dimension.numberScale.step -
            Math.round(
              (field.value - dimension.numberScale.min) /
                dimension.numberScale.step,
            ),
        ) > 1e-8)
    )
      add(
        issues,
        "taxonomy-number-out-of-scale",
        "Numeric taxonomy value is outside its declared scale.",
        `${path}.weaponProfile.${fieldName}`,
      );
    if (
      fieldName === "demolitionPower" &&
      (typeof field.value !== "number" ||
        !Number.isInteger(field.value) ||
        field.value < 0 ||
        field.value > 60)
    )
      add(
        issues,
        "demolition-power-out-of-contract",
        "demolitionPower must be an integer in 0..60 under the current schema.",
        `${path}.weaponProfile.${fieldName}`,
      );
  }
}

function checkAttackProfile(
  item: any,
  path: string,
  issues: ValidationIssue[],
) {
  if (!item.attackProfile) return;
  const profile = item.attackProfile;
  if (
    typeof profile.version !== "string" ||
    !hasSources(profile.sourceRefs) ||
    !statuses.has(profile.verificationStatus) ||
    !Array.isArray(profile.components) ||
    !profile.components.length
  )
    add(
      issues,
      "invalid-attack-profile",
      "AttackProfile requires version, sources and components.",
      `${path}.attackProfile`,
    );
  const ids = new Set();
  for (const [index, component] of (profile.components ?? []).entries()) {
    const componentPath = `${path}.attackProfile.components[${index}]`;
    if (
      !isRecord(component) ||
      typeof component.id !== "string" ||
      typeof component.label !== "string" ||
      ![
        "projectile",
        "shrapnel",
        "explosion",
        "spray",
        "melee",
        "charge",
        "alternate",
        "status",
        "other",
      ].includes(component.componentType) ||
      !isRecord(component.fields) ||
      !hasSources(component.sourceRefs) ||
      !statuses.has(component.verificationStatus)
    )
      add(
        issues,
        "invalid-attack-component",
        "Invalid attack component.",
        componentPath,
      );
    if (isRecord(component) && ids.has(component.id))
      add(
        issues,
        "duplicate-attack-component",
        `Duplicate attack component ${component.id}.`,
        componentPath,
      );
    if (isRecord(component)) ids.add(component.id);
    const fields = component.fields ?? {};
    if (fields.armorPenetration) {
      const penetration = fields.armorPenetration;
      if (
        typeof penetration.label !== "string" ||
        (penetration.value !== undefined &&
          (!Number.isInteger(penetration.value) ||
            penetration.value < 0 ||
            penetration.value > 10)) ||
        !hasSources(penetration.sourceRefs)
      )
        add(
          issues,
          "invalid-attack-penetration",
          "AP must retain a Wiki label, 0..10 value and field sourceRefs.",
          `${componentPath}.fields.armorPenetration`,
        );
    }
    for (const field of [
      "standardDamage",
      "durableDamage",
      "dps",
      "demolitionForce",
      "stagger",
      "push",
      "innerRadius",
      "outerRadius",
    ])
      if (
        fields[field] !== undefined &&
        (typeof fields[field] !== "number" || !Number.isFinite(fields[field]))
      )
        add(
          issues,
          "invalid-attack-number",
          `Invalid attack field ${field}.`,
          `${componentPath}.fields.${field}`,
        );
    if (
      fields.demolitionForce !== undefined &&
      (!Number.isInteger(fields.demolitionForce) ||
        fields.demolitionForce < 0 ||
        fields.demolitionForce > 60)
    )
      add(
        issues,
        "demolition-power-out-of-contract",
        "demolitionForce must be an integer in 0..60.",
        `${componentPath}.fields.demolitionForce`,
      );
  }
  if (profile.primaryComponentId && !ids.has(profile.primaryComponentId))
    add(
      issues,
      "missing-primary-attack-component",
      "primaryComponentId must refer to a component.",
      `${path}.attackProfile.primaryComponentId`,
    );
}

function checkItem(
  item: any,
  index: number,
  warbondIds: Set<string>,
  taxonomy: Map<string, any>,
  issues: ValidationIssue[],
  names: Set<string>,
  aliases: Map<string, string>,
) {
  const path = `items[${index}]`;
  if (!isRecord(item)) {
    add(issues, "invalid-item", "Item must be an object.", path);
    return;
  }
  for (const field of ["id", "nameZh", "nameEn", "model", "notes"])
    if (typeof item[field] !== "string")
      add(
        issues,
        "invalid-item-field",
        `${field} must be a string.`,
        `${path}.${field}`,
      );
  if (names.has(item.nameZh))
    add(
      issues,
      "duplicate-formal-name",
      `Duplicate formal name ${item.nameZh}.`,
      `${path}.nameZh`,
    );
  names.add(item.nameZh);
  if (
    !categories.has(item.category) ||
    !statuses.has(item.verificationStatus) ||
    !["admitted", "candidate", "quarantine"].includes(item.admissionStatus)
  )
    add(
      issues,
      "invalid-item-status",
      "Invalid item category, verification or admission status.",
      path,
    );
  if (!hasSources(item.sourceRefs))
    add(
      issues,
      "missing-source",
      "Item needs sourceRefs.",
      `${path}.sourceRefs`,
    );
  if (
    !isRecord(item.image) ||
    typeof item.image.path !== "string" ||
    !hasSources(item.image.sourceRefs) ||
    !["placeholder", "candidate", "verified"].includes(item.image.status) ||
    !["project-created-placeholder", "pending", "documented"].includes(
      item.image.licenseStatus,
    )
  )
    add(
      issues,
      "invalid-asset-record",
      "Item image lacks manifest metadata.",
      `${path}.image`,
    );
  if (
    isRecord(item.image) &&
    item.image.provenanceStatus !== undefined &&
    !["verified", "pending"].includes(item.image.provenanceStatus)
  )
    add(
      issues,
      "invalid-asset-provenance-status",
      "Asset provenanceStatus must be verified or pending.",
      `${path}.image.provenanceStatus`,
    );
  if (
    isRecord(item.image) &&
    item.image.rightsStatus !== undefined &&
    !["open-license", "documented-copyrighted", "pending"].includes(
      item.image.rightsStatus,
    )
  )
    add(
      issues,
      "invalid-asset-rights-status",
      "Asset rightsStatus is invalid.",
      `${path}.image.rightsStatus`,
    );
  if (
    isRecord(item.image) &&
    item.image.status === "verified" &&
    (item.image.provenanceStatus !== "verified" ||
      item.image.rightsStatus === "pending")
  )
    add(
      issues,
      "unverified-asset-marked-verified",
      "A verified image needs verified provenance and an honest rights status.",
      `${path}.image`,
    );
  if (!Array.isArray(item.aliases))
    add(
      issues,
      "invalid-aliases",
      "aliases must be an array.",
      `${path}.aliases`,
    );
  for (const [aliasIndex, alias] of (item.aliases ?? []).entries()) {
    if (
      !isRecord(alias) ||
      typeof alias.text !== "string" ||
      !hasSources(alias.sourceRefs)
    ) {
      add(
        issues,
        "invalid-alias",
        "Alias needs text and sources.",
        `${path}.aliases[${aliasIndex}]`,
      );
      continue;
    }
    const key = normalizeSearchText(alias.text);
    if (aliases.has(key) && aliases.get(key) !== item.id)
      add(
        issues,
        "alias-conflict",
        `Alias conflict: ${alias.text}.`,
        `${path}.aliases[${aliasIndex}]`,
      );
    aliases.set(key, item.id);
  }
  checkAcquisition(item, path, warbondIds, issues);
  checkWeaponProfile(item, path, taxonomy, issues);
  checkAttackProfile(item, path, issues);
  if (
    !Array.isArray(item.translationEvidence) ||
    !item.translationEvidence.length
  )
    add(
      issues,
      "missing-translation-evidence",
      "Formal item needs translation evidence.",
      `${path}.translationEvidence`,
    );
}

export function validateCatalog(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (
    !isRecord(value) ||
    !isRecord(value.meta) ||
    !isRecord(value.taxonomy) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.warbonds) ||
    !Array.isArray(value.glossaryTerms)
  )
    return {
      ok: false,
      issues: [
        {
          code: "invalid-catalog",
          message: "Catalog structure is incomplete.",
          path: "catalog",
          severity: "error",
        },
      ],
    };
  const taxonomy = checkTaxonomy(value.taxonomy, issues);
  const warbondIds = new Set<string>();
  for (const [index, warbond] of value.warbonds.entries()) {
    if (
      !isRecord(warbond) ||
      typeof warbond.id !== "string" ||
      !hasSources(warbond.sourceRefs) ||
      !statuses.has(warbond.verificationStatus)
    )
      add(issues, "invalid-warbond", "Invalid warbond.", `warbonds[${index}]`);
    else if (warbondIds.has(warbond.id))
      add(
        issues,
        "duplicate-warbond-id",
        `Duplicate warbond ${warbond.id}.`,
        `warbonds[${index}]`,
      );
    else warbondIds.add(warbond.id);
  }
  const names = new Set<string>();
  const aliases = new Map<string, string>();
  for (const [index, item] of value.items.entries())
    checkItem(item, index, warbondIds, taxonomy, issues, names, aliases);
  for (const [index, item] of (value.quarantine ?? []).entries()) {
    if (isRecord(item) && item.admissionStatus === "admitted")
      add(
        issues,
        "quarantine-admitted",
        "Quarantine item cannot be admitted.",
        `quarantine[${index}]`,
      );
  }
  return { ok: issues.every((issue) => issue.severity !== "error"), issues };
}

export function assertValidCatalog(value: unknown): asserts value is Catalog {
  const result = validateCatalog(value);
  if (!result.ok)
    throw new Error(
      result.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("\n"),
    );
}
