import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "src/data/catalog.json");
const candidatesPath = resolve(root, "src/data/candidates/user-supplied.json");
const assetManifestPath = resolve(root, "src/data/assets/manifest.json");
const errors = [];
const warnings = [];

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));
const assetManifest = JSON.parse(await readFile(assetManifestPath, "utf8"));
const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);
const isRecord = (value) => typeof value === "object" && value !== null;
const hasSources = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (source) =>
      isRecord(source) &&
      typeof source.kind === "string" &&
      typeof source.label === "string",
  );
const hasTrustedSource = (value) =>
  Array.isArray(value) &&
  value.some(
    (source) =>
      isRecord(source) &&
      ["game-data", "official", "wiki", "community", "manual"].includes(
        source.kind,
      ),
  );
const dimensions = new Set([
  "weaponType",
  "ammoTraits",
  "armorPenetration",
  "demolitionPower",
]);
const expectedKinds = {
  weaponType: "single",
  ammoTraits: "multi",
  armorPenetration: "number",
  demolitionPower: "number",
};
const acquisitionKinds = new Set([
  "warbond",
  "requisition",
  "default",
  "superstore",
  "edition",
  "event",
  "unavailable",
  "other",
]);

if (
  !isRecord(catalog) ||
  !isRecord(catalog.meta) ||
  !isRecord(catalog.taxonomy) ||
  !Array.isArray(catalog.items) ||
  !Array.isArray(catalog.warbonds) ||
  !Array.isArray(catalog.glossaryTerms)
)
  addError("catalog 根结构不完整。");
if (
  !isRecord(catalog.taxonomy) ||
  typeof catalog.taxonomy.version !== "string" ||
  !isRecord(catalog.taxonomy.dimensions)
)
  addError("taxonomy 必须有版本与 dimensions。");

const checkedDimensions = new Map();
const assetPaths = new Set();
if (!isRecord(assetManifest) || !Array.isArray(assetManifest.assets)) {
  addError("图片 manifest 必须包含 assets 数组。");
} else {
  for (const asset of assetManifest.assets) {
    const validAsset =
      isRecord(asset) &&
      typeof asset.path === "string" &&
      typeof asset.alt === "string" &&
      ["placeholder", "candidate", "verified"].includes(asset.status) &&
      (asset.originalPage === null || typeof asset.originalPage === "string") &&
      (asset.author === null || typeof asset.author === "string") &&
      typeof asset.syncedAt === "string" &&
      (asset.fileHash === null || typeof asset.fileHash === "string") &&
      ["project-created-placeholder", "pending", "documented"].includes(
        asset.licenseStatus,
      ) &&
      hasSources(asset.sourceRefs);
    const assetPath =
      isRecord(asset) && typeof asset.path === "string" ? asset.path : null;
    if (!validAsset || (assetPath !== null && assetPaths.has(assetPath)))
      addError("图片 manifest 有重复或无效记录。");
    if (validAsset) {
      if (asset.path.startsWith("/") || asset.path.includes(".."))
        addError(`图片路径不安全：${asset.path}`);
      else {
        try {
          const assetFile = resolve(root, "public", asset.path);
          await access(assetFile);
          if (asset.fileHash !== null) {
            const actualHash = createHash("sha256")
              .update(await readFile(assetFile))
              .digest("hex");
            if (actualHash !== asset.fileHash.toLowerCase())
              addError(`图片哈希不匹配：${asset.path}`);
          }
        } catch {
          addError(`图片文件不存在：public/${asset.path}`);
        }
      }
      assetPaths.add(asset.path);
    }
  }
}

const warbondIds = new Set();
for (const warbond of Array.isArray(catalog.warbonds) ? catalog.warbonds : []) {
  if (!isRecord(warbond) || typeof warbond.id !== "string") {
    addError("债券缺少稳定 ID。");
    continue;
  }
  if (warbondIds.has(warbond.id)) addError(`重复债券 ID：${warbond.id}`);
  warbondIds.add(warbond.id);
  if (!hasSources(warbond.sourceRefs))
    addError(`债券 ${warbond.id} 缺少来源记录。`);
  if (!["verified", "pending", "sample"].includes(warbond.verificationStatus))
    addError(`债券 ${warbond.id} 核验状态无效。`);
  if (
    warbond.verificationStatus === "verified" &&
    !hasTrustedSource(warbond.sourceRefs)
  )
    addError(`债券 ${warbond.id} 的 verified 来源不可信。`);
  if (
    warbond.superCredits !== null &&
    (typeof warbond.superCredits !== "number" ||
      !Number.isFinite(warbond.superCredits) ||
      warbond.superCredits < 0)
  )
    addError(`债券 ${warbond.id} 的超级货币价格非法。`);
}
if (isRecord(catalog.taxonomy?.dimensions)) {
  for (const [id, dimension] of Object.entries(catalog.taxonomy.dimensions)) {
    if (!dimensions.has(id) || !isRecord(dimension)) {
      addError(`未知 taxonomy 维度：${id}`);
      continue;
    }
    checkedDimensions.set(id, dimension);
    if (
      dimension.id !== id ||
      typeof dimension.taxonomySource !== "string" ||
      dimension.taxonomySource.length === 0 ||
      typeof dimension.scaleVersion !== "string" ||
      dimension.scaleVersion.length === 0 ||
      !["single", "multi", "number"].includes(dimension.valueKind) ||
      !hasSources(dimension.sourceRefs) ||
      !Array.isArray(dimension.options)
    )
      addError(`taxonomy 维度 ${id} 字段不完整。`);
    if (dimension.valueKind !== expectedKinds[id])
      addError(
        `taxonomy 维度 ${id} 的 valueKind 必须是 ${expectedKinds[id]}。`,
      );
    if (
      !["verified", "pending", "sample"].includes(dimension.verificationStatus)
    )
      addError(`taxonomy 维度 ${id} 核验状态无效。`);
    if (
      dimension.verificationStatus === "verified" &&
      !hasTrustedSource(dimension.sourceRefs)
    )
      addError(`taxonomy 维度 ${id} 的 verified 来源不可信。`);
    const optionIds = new Set();
    for (const option of dimension.options ?? []) {
      if (
        !isRecord(option) ||
        typeof option.id !== "string" ||
        typeof option.labelZh !== "string" ||
        !hasSources(option.sourceRefs)
      )
        addError(`taxonomy ${id} 有无效选项。`);
      if (
        isRecord(option) &&
        !["verified", "pending", "sample"].includes(option.verificationStatus)
      )
        addError(`taxonomy ${id} 选项核验状态无效。`);
      if (
        isRecord(option) &&
        option.verificationStatus === "verified" &&
        !hasTrustedSource(option.sourceRefs)
      )
        addError(`taxonomy ${id} 的 verified 选项来源不可信。`);
      if (optionIds.has(option?.id))
        addError(`taxonomy ${id} 有重复选项 ${option.id}。`);
      optionIds.add(option?.id);
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
        !Number.isFinite(scale.min) ||
        !Number.isFinite(scale.max) ||
        !Number.isFinite(scale.step) ||
        scale.step <= 0 ||
        scale.max < scale.min
      )
        addError(`taxonomy ${id} 的数值标尺无效。`);
      if (
        id === "demolitionPower" &&
        (scale.min !== 0 || scale.max !== 50 || scale.step !== 1)
      )
        addError(
          "demolitionPower 当前产品标尺必须是整数 0..50；变更必须通过 taxonomy 版本迁移。",
        );
    }
  }
}

const ids = new Set();
const names = new Set();
const aliases = new Map();
for (const [index, item] of (Array.isArray(catalog.items)
  ? catalog.items
  : []
).entries()) {
  const path = `items[${index}]`;
  if (!isRecord(item)) {
    addError(`${path} 不是对象。`);
    continue;
  }
  if (ids.has(item.id)) addError(`重复装备 ID：${item.id}`);
  ids.add(item.id);
  if (names.has(item.nameZh)) addError(`重复正式名：${item.nameZh}`);
  names.add(item.nameZh);
  if (
    !["weapon", "armor", "stratagem", "grenade", "booster"].includes(
      item.category,
    )
  )
    addError(`${path} 类别无效。`);
  if (!["verified", "pending", "sample"].includes(item.verificationStatus))
    addError(`${path} 核验状态无效。`);
  if (!hasSources(item.sourceRefs)) addError(`${path} 缺少来源记录。`);
  if (
    item.verificationStatus === "verified" &&
    !hasTrustedSource(item.sourceRefs)
  )
    addError(`${path} 的 verified 来源不可信。`);
  if (
    !isRecord(item.image) ||
    typeof item.image.path !== "string" ||
    typeof item.image.alt !== "string" ||
    !["placeholder", "candidate", "verified"].includes(item.image.status) ||
    (item.image.originalPage !== null &&
      typeof item.image.originalPage !== "string") ||
    (item.image.author !== null && typeof item.image.author !== "string") ||
    typeof item.image.syncedAt !== "string" ||
    (item.image.fileHash !== null && typeof item.image.fileHash !== "string") ||
    !["project-created-placeholder", "pending", "documented"].includes(
      item.image.licenseStatus,
    ) ||
    !hasSources(item.image.sourceRefs)
  )
    addError(`${path} 缺少图片来源记录或同步元数据。`);
  if (
    isRecord(item.image) &&
    item.image.status === "verified" &&
    (!hasTrustedSource(item.image.sourceRefs) ||
      item.image.licenseStatus !== "documented")
  )
    addError(`${path} 的 verified 图片缺少可信来源或 documented 许可状态。`);
  if (isRecord(item.image) && !assetPaths.has(item.image.path))
    addError(`${path} 的图片路径不在 assets manifest 中。`);
  if (
    !item.search ||
    typeof item.search.formalName !== "string" ||
    !Array.isArray(item.search.pinyinFull) ||
    !Array.isArray(item.search.pinyinInitials)
  )
    addError(`${path} 缺少生成的搜索索引。`);
  if (item.category !== "weapon" && item.weaponProfile !== undefined)
    addError(`${path} 非武器不能有 weaponProfile。`);
  if (!Array.isArray(item.aliases)) addError(`${path} aliases 必须是数组。`);
  for (const alias of Array.isArray(item.aliases) ? item.aliases : []) {
    if (!isRecord(alias) || typeof alias.text !== "string") {
      addError(`${path} 有无效外号记录。`);
      continue;
    }
    if (!hasSources(alias.sourceRefs)) addError(`${path} 有无效外号来源。`);
    if (
      isRecord(alias) &&
      !["community", "model", "translation", "other"].includes(alias.kind)
    )
      addError(`${path} 外号类别无效。`);
    if (
      isRecord(alias) &&
      !["verified", "pending", "rare"].includes(alias.reviewStatus)
    )
      addError(`${path} 外号审核状态无效。`);
    if (
      isRecord(alias) &&
      alias.reviewStatus === "verified" &&
      !hasTrustedSource(alias.sourceRefs)
    )
      addError(`${path} 的 verified 外号来源不可信。`);
    const prior = aliases.get(alias.text);
    if (prior && prior !== item.id)
      addError(`外号冲突：${alias.text} (${prior}/${item.id})`);
    aliases.set(alias.text, item.id);
  }
  const acquisition = item.acquisition;
  if (!acquisitionKinds.has(acquisition?.kind))
    addError(`${path} 获取方式未知。`);
  if (acquisition?.kind === "warbond" && !warbondIds.has(acquisition.warbondId))
    addError(`${path} 引用了不存在债券。`);
  if (
    acquisition?.kind === "edition" &&
    (typeof acquisition.editionName !== "string" ||
      acquisition.editionName.length === 0)
  )
    addError(`${path} 版本奖励缺少版本名称。`);
  if (
    acquisition?.kind === "event" &&
    (typeof acquisition.eventName !== "string" ||
      acquisition.eventName.length === 0)
  )
    addError(`${path} 活动获取缺少活动名称。`);
  if (
    acquisition?.kind === "other" &&
    (typeof acquisition.label !== "string" || acquisition.label.length === 0)
  )
    addError(`${path} 其他获取方式缺少标签。`);
  if (
    acquisition?.page !== null &&
    acquisition?.page !== undefined &&
    (!Number.isInteger(acquisition.page) || acquisition.page < 1)
  )
    addError(`${path} 页码非法。`);
  for (const field of [
    "itemMedals",
    "pageUnlockMedals",
    "superCredits",
    "requisitionPoints",
  ])
    if (
      acquisition?.[field] !== undefined &&
      acquisition[field] !== null &&
      (typeof acquisition[field] !== "number" || acquisition[field] < 0)
    )
      addError(`${path} ${field} 价格非法。`);
  if (item.weaponProfile) {
    for (const [fieldName, field] of Object.entries(item.weaponProfile)) {
      const dimension = checkedDimensions.get(fieldName);
      if (!dimensions.has(fieldName) || !isRecord(field) || !dimension) {
        addError(`${path}.weaponProfile.${fieldName} 没有 taxonomy 定义。`);
        continue;
      }
      if (
        !hasSources(field.sourceRefs) ||
        field.taxonomySource !== dimension.taxonomySource ||
        field.scaleVersion !== dimension.scaleVersion
      )
        addError(
          `${path}.weaponProfile.${fieldName} 来源或 taxonomy 版本不一致。`,
        );
      if (!["verified", "pending"].includes(field.verificationStatus))
        addError(`${path}.weaponProfile.${fieldName} 核验状态无效。`);
      if (
        field.verificationStatus === "verified" &&
        dimension.verificationStatus !== "verified"
      )
        addError(
          `${path}.weaponProfile.${fieldName} 在未核验 taxonomy 下不能标记 verified。`,
        );
      if (
        field.verificationStatus === "verified" &&
        !hasTrustedSource(field.sourceRefs)
      )
        addError(`${path}.weaponProfile.${fieldName} 的 verified 来源不可信。`);
      const optionIds = new Set(
        (dimension.options ?? []).map((option) => option.id),
      );
      let values = [];
      if (dimension.valueKind === "single") {
        if (typeof field.value !== "string" || field.value.length === 0)
          addError(`${path}.weaponProfile.${fieldName} 必须是单个字符串值。`);
        else values = [field.value];
      } else if (dimension.valueKind === "multi") {
        if (
          !Array.isArray(field.value) ||
          field.value.length === 0 ||
          !field.value.every(
            (value) => typeof value === "string" && value.length > 0,
          ) ||
          new Set(field.value).size !== field.value.length
        )
          addError(
            `${path}.weaponProfile.${fieldName} 必须是无重复的非空字符串数组。`,
          );
        else values = field.value;
      } else if (
        typeof field.value !== "number" ||
        !Number.isFinite(field.value)
      ) {
        addError(`${path}.weaponProfile.${fieldName} 必须是有限数字。`);
      }
      for (const value of values) {
        if (!optionIds.has(value)) {
          const message = `${path}.weaponProfile.${fieldName} 使用未知 taxonomy 值 ${value}。`;
          if (field.verificationStatus === "verified") addError(message);
          else addWarning(`${message} 当前保持待核验。`);
        }
      }
      if (dimension.valueKind === "number" && typeof field.value === "number") {
        if (
          fieldName === "demolitionPower" &&
          (!Number.isInteger(field.value) ||
            field.value < 0 ||
            field.value > 50)
        )
          addError(`${path}.weaponProfile.demolitionPower 必须是整数 0..50。`);
        if (!dimension.numberScale && field.verificationStatus === "verified")
          addError(
            `${path}.weaponProfile.${fieldName} 没有明确数值标尺，不能 verified。`,
          );
      }
      if (
        dimension.valueKind === "number" &&
        dimension.numberScale &&
        typeof field.value === "number" &&
        Number.isFinite(field.value)
      ) {
        const { min, max, step } = dimension.numberScale;
        if (
          field.value < min ||
          field.value > max ||
          Math.abs(
            (field.value - min) / step - Math.round((field.value - min) / step),
          ) > 1e-8
        )
          addError(
            `${path}.weaponProfile.${fieldName} 超出 taxonomy 数值标尺。`,
          );
      }
      if (field.verificationStatus === "pending")
        addWarning(
          `${path}.weaponProfile.${fieldName} 仍待核验，不会进入筛选。`,
        );
    }
  }
}

const glossaryIds = new Set();
const glossaryAliases = new Set();
for (const [index, term] of (catalog.glossaryTerms ?? []).entries()) {
  const path = `glossaryTerms[${index}]`;
  if (
    !isRecord(term) ||
    typeof term.id !== "string" ||
    typeof term.titleZh !== "string" ||
    typeof term.description !== "string" ||
    !Array.isArray(term.aliases) ||
    term.aliases.length === 0 ||
    !term.aliases.every(
      (alias) => typeof alias === "string" && alias.length > 0,
    ) ||
    !Array.isArray(term.examples) ||
    !term.examples.every((example) => typeof example === "string") ||
    !hasSources(term.sourceRefs) ||
    !["verified", "pending"].includes(term.verificationStatus)
  ) {
    addError(`${path} 术语记录不完整。`);
    continue;
  }
  if (glossaryIds.has(term.id)) addError(`${path} 术语 ID 重复：${term.id}`);
  glossaryIds.add(term.id);
  for (const alias of term.aliases) {
    if (glossaryAliases.has(alias)) addError(`${path} 术语俗称重复：${alias}`);
    glossaryAliases.add(alias);
  }
}

const expectedRawTexts = [
  "电榴弹–法律铁碗",
  "最后通牒–自由公仆",
  "制导手枪–外骨骼装甲专家",
  "焦土–绝地潜兵总动员",
  "导弹井–尘卷风",
  "离子喷–遥遥领先",
  "爆炸弩，爆裂铳，铝热剂–民主爆破",
  "千兆雷，工兵甲–堑壕之师",
  "荡平者–破围先锋",
  "潜行甲，审查官–绝密军团",
];
if (
  !Array.isArray(candidates.records) ||
  candidates.records.length !== expectedRawTexts.length
)
  addError("用户候选层数量不符合预期。");
for (const [index, record] of (candidates.records ?? []).entries()) {
  if (record.rawText !== expectedRawTexts[index])
    addError(`候选 ${index + 1} 原始拼写被改变。`);
  if (
    record.source !== "user" ||
    record.verificationStatus !== "pending" ||
    typeof record.submittedAt !== "string" ||
    typeof record.proposedEquipment !== "string" ||
    typeof record.proposedWarbond !== "string"
  )
    addError(`候选 ${index + 1} 必须保持 user/pending 结构。`);
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${catalog.items.length} catalog items, ${catalog.glossaryTerms.length} glossary terms, ${checkedDimensions.size} taxonomy dimensions, and ${candidates.records.length} pending candidates.`,
  );
}
