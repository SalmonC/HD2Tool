import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import prettier from "prettier";
import { selectEquipmentWikiUrl } from "./lib/equipment-wiki-url.mjs";
import { classifyProductScope } from "./lib/product-scope.mjs";

const root = resolve(import.meta.dirname, "..");
const communityPath = resolve(
  root,
  "src/data/source/xiaoheihe-community-aliases.json",
);
const catalogSourcePath = resolve(root, "src/data/source/catalog-source.json");
const wikiPath = resolve(root, "src/data/source/wiki-normalized.json");
const assetManifestPath = resolve(root, "src/data/assets/manifest.json");
const overridesPath = resolve(root, "src/data/overrides/manual-overrides.json");
const translationEvidencePath = resolve(
  root,
  "src/data/source/translation-evidence.json",
);
const officialLocalizationPath = resolve(
  root,
  "src/data/source/official-localization.json",
);
const p0_2TranslationPath = resolve(
  root,
  "src/data/source/translation-p0-2.json",
);
const p0_3TranslationPath = resolve(
  root,
  "src/data/source/translation-p0-3.json",
);
const warbondTranslationEvidencePath = resolve(
  root,
  "src/data/source/warbond-translation-evidence.json",
);
const warbondPageThresholdsPath = resolve(
  root,
  "src/data/source/warbond-page-thresholds.json",
);
const warbondContentAliasesPath = resolve(
  root,
  "src/data/source/warbond-content-aliases.json",
);
const outputPath = resolve(root, "src/data/catalog.json");
const runtimeOutputPath = resolve(root, "src/data/catalog-runtime.json");

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
};
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
const cleanAlias = (value) => {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^[、，,。；;：:\s]+|[、，,。；;：:\s]+$/gu, "")
    .trim();
  return normalize(cleaned) ? cleaned : null;
};
const cleanAliases = (values) =>
  values
    .flatMap((value) => String(value ?? "").split(/[、，,]+/u))
    .map(cleanAlias)
    .filter(Boolean)
    .filter(
      (value, index, all) =>
        all.findIndex(
          (candidate) => normalize(candidate) === normalize(value),
        ) === index,
    );
const pinyinMap = new Map(
  Object.entries({
    高: "gao",
    燃: "ran",
    破: "po",
    裂: "lie",
    者: "zhe",
    野: "ye",
    炊: "chui",
    雷: "lei",
    霆: "ting",
    等: "deng",
    离: "li",
    子: "zi",
    制: "zhi",
    裁: "cai",
    决: "jue",
    最: "zui",
    后: "hou",
    通: "tong",
    牒: "die",
    参: "can",
    议: "yi",
    员: "yuan",
    猛: "meng",
    爪: "zhao",
    游: "you",
    击: "ji",
    兵: "bing",
    眩: "xuan",
    晕: "yun",
    长: "chang",
    矛: "mao",
    消: "xiao",
    耗: "hao",
    反: "fan",
    坦: "tan",
    克: "ke",
    武: "wu",
    器: "qi",
    磁: "ci",
    轨: "gui",
    炮: "pao",
    飞: "fei",
    矛: "mao",
    黄: "huang",
    蜂: "feng",
    唯: "wei",
    一: "yi",
    真: "zhen",
    旗: "qi",
    缓: "huan",
    和: "he",
    使: "shi",
    冲: "chong",
    击: "ji",
    弹: "dan",
    炸: "zha",
    药: "yao",
    铝: "lv",
    热: "re",
    海: "hai",
    胆: "dan",
    轨: "gui",
    道: "dao",
    凝: "ning",
    固: "gu",
    汽: "qi",
    油: "you",
    火: "huo",
    力: "li",
    网: "wang",
    防: "fang",
    护: "hu",
    罩: "zhao",
    生: "sheng",
    成: "cheng",
    实: "shi",
    激: "ji",
    光: "guang",
    毒: "du",
    腐: "fu",
    息: "xi",
    电: "dian",
    狗: "gou",
    喷: "pen",
    气: "qi",
    背: "bei",
    包: "bao",
    悬: "xuan",
    浮: "fu",
    便: "bian",
    携: "xie",
    地: "di",
    狱: "yu",
    轰: "hong",
    外: "wai",
    骨: "gu",
    骼: "ge",
    机: "ji",
    甲: "jia",
    电: "dian",
    磁: "ci",
    迫: "po",
    击: "ji",
    哨: "shao",
    戒: "jie",
    反: "fan",
    坦: "tan",
    炮: "pao",
    台: "tai",
    掷: "zhi",
    墙: "qiang",
    督: "du",
    察: "cha",
    员: "yuan",
  }),
);
const toPinyin = (value) =>
  [...String(value)]
    .map(
      (char) => pinyinMap.get(char) ?? (/^[\x00-\x7f]$/.test(char) ? char : ""),
    )
    .join("");
const initials = (value) =>
  [...String(value)]
    .map(
      (char) =>
        pinyinMap.get(char)?.[0] ?? (/^[\x00-\x7f]$/.test(char) ? char : ""),
    )
    .join("");
const sourceRef = (label, url, kind = "community") => ({
  kind,
  label,
  ...(url ? { url } : {}),
});

const community = await readJson(communityPath, {
  version: "missing",
  sourceRef: sourceRef("missing"),
  warbonds: [],
  equipment: [],
  glossaryTerms: [],
});
const catalogSource = await readJson(catalogSourcePath, { overrides: [] });
const wiki = await readJson(wikiPath, {
  version: "none",
  items: [],
  discoveredPages: [],
  currencies: [],
  coverage: {},
});
const assets = await readJson(assetManifestPath, {
  version: "0.1.0",
  assets: [],
});
const overrides = await readJson(overridesPath, { version: "none", items: [] });
const translationEvidence = await readJson(translationEvidencePath, {
  version: "none",
  sources: [],
  records: [],
});
const officialLocalization = await readJson(officialLocalizationPath, {
  schemaVersion: "missing",
  records: [],
  warbondRecords: [],
  sourceFiles: [],
});
const p0_2Translation = await readJson(p0_2TranslationPath, {
  sourceRegistry: [],
  records: [],
});
const p0_3Translation = await readJson(p0_3TranslationPath, {
  sourceRegistry: [],
  records: [],
});
const warbondTranslationEvidence = await readJson(
  warbondTranslationEvidencePath,
  { records: [] },
);
const warbondPageThresholds = await readJson(warbondPageThresholdsPath, {
  records: [],
});
const warbondContentAliases = await readJson(warbondContentAliasesPath, {
  records: [],
});
const warbondPageThresholdsById = new Map(
  (warbondPageThresholds.records ?? []).map((record) => [
    record.warbondId,
    record,
  ]),
);
const assetsByPath = new Map(
  (assets.assets ?? []).map((asset) => [asset.path, asset]),
);
const assetsByItemId = new Map(
  (assets.assets ?? [])
    .filter((asset) => asset.itemId)
    .map((asset) => [asset.itemId, asset]),
);
const assetsByFileTitle = new Map(
  (assets.assets ?? [])
    .filter((asset) => asset.fileTitle)
    .map((asset) => [asset.fileTitle, asset]),
);
const placeholder = assetsByPath.get("assets/placeholder-equipment.svg") ?? {
  path: "assets/placeholder-equipment.svg",
  alt: "装备图片",
  status: "placeholder",
  originalPage: null,
  filePage: null,
  originalUrl: null,
  author: "HD2 军需簿 contributors",
  syncedAt: new Date().toISOString(),
  fileHash: null,
  sourceRefs: [sourceRef("项目自制通用占位图", undefined, "local-fixture")],
  licenseStatus: "project-created-placeholder",
};
const wikiById = new Map((wiki.items ?? []).map((item) => [item.id, item]));
const communityById = new Map(
  (community.equipment ?? []).map((item) => [item.id, item]),
);
const overrideById = new Map(
  [
    ...(Array.isArray(catalogSource.overrides) ? catalogSource.overrides : []),
    ...(overrides.items ?? []),
  ].map((item) => [item.id, item]),
);
const translationSourceById = new Map(
  [
    ...(translationEvidence.sources ?? []),
    ...(p0_2Translation.sourceRegistry ?? []),
    ...(p0_3Translation.sourceRegistry ?? []),
  ].map((source) => [source.id, source]),
);
const translationById = new Map(
  (translationEvidence.records ?? []).map((record) => [
    record.canonicalId,
    record,
  ]),
);
const p0_2TranslationById = new Map(
  (p0_2Translation.records ?? []).map((record) => [record.canonicalId, record]),
);
const p0_3TranslationById = new Map(
  (p0_3Translation.records ?? []).map((record) => [record.canonicalId, record]),
);
const normalizeEnglish = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsaviour\b/g, "savior")
    .replace(/\bmarshall\b/g, "marshal")
    .trim();
const normalizeModel = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");
const officialRecords = (officialLocalization.records ?? [])
  .filter((record) => record.english && record.simplifiedChinese)
  .map((record) => ({
    ...record,
    englishKey: normalizeEnglish(record.english),
  }));
const officialByEnglish = new Map();
for (const record of officialRecords) {
  const existing = officialByEnglish.get(record.englishKey) ?? [];
  existing.push(record);
  officialByEnglish.set(record.englishKey, existing);
}
const communityByModel = new Map(
  (community.equipment ?? [])
    .filter((item) => item.model && !/^[-—]+$/.test(item.model))
    .map((item) => [normalizeModel(item.model), item]),
);
const translationByModel = new Map(
  (translationEvidence.records ?? [])
    .filter((record) => record.model)
    .map((record) => [normalizeModel(record.model), record]),
);
const communitySource =
  community.sourceRef ?? sourceRef("用户提供的小黑盒社区转录", undefined);
const wikiWarbonds = new Map(
  (wiki.warbonds ?? []).map((warbond) => [warbond.id, warbond]),
);
for (const wikiWarbond of wikiWarbonds.values()) {
  if (warbondPageThresholdsById.has(wikiWarbond.id)) continue;
  const cumulative = wikiWarbond.pageUnlockMedals;
  if (!cumulative || typeof cumulative !== "object") continue;
  warbondPageThresholdsById.set(wikiWarbond.id, {
    warbondId: wikiWarbond.id,
    pages: Object.entries(cumulative).map(([page, cumulativeMedals]) => ({
      page: Number(page),
      incrementalMedals: null,
      cumulativeMedals,
      sourceRefs:
        wikiWarbond.pageUnlockMedalsSourceRefs ?? wikiWarbond.sourceRefs ?? [],
    })),
    sourceRefs:
      wikiWarbond.pageUnlockMedalsSourceRefs ?? wikiWarbond.sourceRefs ?? [],
    evidenceMode: "cumulative-only",
  });
}
const warbondContentAliasByKey = new Map(
  (warbondContentAliases.records ?? []).map((record) => [
    `${record.warbondId}:${record.page}:${normalize(record.contentsTitle)}`,
    record,
  ]),
);
const warbondTranslationById = new Map(
  (warbondTranslationEvidence.records ?? []).map((record) => [
    record.canonicalId,
    record,
  ]),
);
const warbonds = [
  ...new Set([
    ...wikiWarbonds.keys(),
    ...community.warbonds.map((entry) => entry.id),
  ]),
].map((warbondId) => {
  const wikiWarbond = wikiWarbonds.get(warbondId);
  const communityWarbond = community.warbonds.find(
    (entry) => entry.id === warbondId,
  );
  const translation = warbondTranslationById.get(warbondId);
  const pageThresholdRecord = warbondPageThresholdsById.get(warbondId);
  const officialName = null;
  return {
    ...(communityWarbond ?? {}),
    id: warbondId,
    nameZh:
      translation?.nameZh ??
      officialName?.candidateZh ??
      communityWarbond?.nameZh ??
      "",
    nameEn: wikiWarbond?.nameEn ?? communityWarbond?.nameEn,
    kind: "warbond",
    superCredits:
      wikiWarbond?.superCredits ?? communityWarbond?.superCredits ?? null,
    sourceRefs: wikiWarbond?.sourceRefs ?? [communitySource],
    verificationStatus: wikiWarbond ? "verified" : "pending",
    ...(pageThresholdRecord
      ? {
          pageThresholds: pageThresholdRecord.pages.map((page) => ({
            ...page,
            sourceRefs: pageThresholdRecord.sourceRefs,
          })),
        }
      : {}),
  };
});
const warbondById = new Map(warbonds.map((entry) => [entry.id, entry]));

function acquisitionReady(acquisition) {
  switch (acquisition.kind) {
    case "warbond":
      const warbond = warbondById.get(acquisition.warbondId);
      return Boolean(
        warbond?.nameZh?.trim() &&
        Number.isInteger(acquisition.page) &&
        acquisition.page > 0 &&
        Number.isInteger(acquisition.itemMedals) &&
        acquisition.itemMedals >= 0 &&
        Number.isInteger(acquisition.pageUnlockMedals) &&
        acquisition.pageUnlockMedals >= 0,
      );
    case "requisition":
      return (
        Number.isInteger(acquisition.requisitionPoints) &&
        acquisition.requisitionPoints >= 0
      );
    case "default":
      return true;
    case "superstore":
      return (
        Number.isInteger(acquisition.superCredits) &&
        acquisition.superCredits >= 0 &&
        acquisition.status !== "pending"
      );
    case "edition":
      return Boolean(
        acquisition.editionName &&
        acquisition.status !== "pending" &&
        (acquisition.status === "unavailable" ||
          acquisition.price === null ||
          Number.isInteger(acquisition.price)),
      );
    case "event":
      return Boolean(acquisition.eventName && acquisition.status !== "pending");
    case "poi":
      return Boolean(acquisition.location && acquisition.status !== "pending");
    case "unavailable":
      return Boolean(acquisition.reason);
    case "other":
      return acquisition.status !== "pending" && Boolean(acquisition.label);
  }
}

function translationReady(evidence) {
  if (!evidence?.length) return false;
  if (evidence.some((entry) => entry.status === "official")) return true;
  const independent = new Set(
    evidence
      .filter((entry) => entry.status === "verified-community")
      .flatMap((entry) =>
        entry.evidenceRefs.map((ref) => ref.url ?? `${ref.kind}:${ref.label}`),
      ),
  );
  return independent.size >= 2;
}

function attackReady(item) {
  if (!item.attackProfile?.components?.length)
    return item.category !== "weapon" && item.category !== "grenade";
  return item.attackProfile.components.some(
    (component) =>
      component.fields.standardDamage !== undefined ||
      component.fields.armorPenetration !== undefined,
  );
}

const weaponTypeLabels = new Map(
  Object.entries({
    Shotguns: "\u6563\u5f39\u67aa",
    Rifles: "\u6b65\u67aa",
    "Marksman Rifles": "\u7cbe\u786e\u5c04\u624b\u6b65\u67aa",
    "Submachine Guns": "\u51b2\u950b\u67aa",
    Pistols: "\u624b\u67aa",
    "Machine Guns": "\u673a\u67aa",
    Launchers: "\u53d1\u5c04\u5668",
    Missiles: "\u5bfc\u5f39",
    "Energy Weapons": "\u80fd\u91cf\u6b66\u5668",
    "Arc Weapons": "\u7535\u5f27\u6b66\u5668",
    Flamethrowers: "\u706b\u7130\u55b7\u5c04\u5668",
  }),
);
const ammoTraitLabels = new Map([
  ["ballistic", "\u5f39\u9053"],
  ["explosion", "\u7206\u70b8\u653b\u51fb"],
  ["fire", "\u706b\u7130"],
  ["plasma", "\u7b49\u79bb\u5b50"],
  ["arc", "\u7535\u5f27"],
]);

const detailFields = (detail) => detail?.fields ?? detail?.rawFields ?? {};
const cleanWikiField = (value) =>
  String(value ?? "")
    .replace(/\{\{\s*\*\s*\}\}/g, " ")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function taxonomyOption(id, labelZh, refs) {
  return { id, labelZh, sourceRefs: refs, verificationStatus: "verified" };
}

function makeTaxonomy() {
  const typeOptions = new Map();
  const ammoOptions = new Map();
  for (const detail of wiki.items ?? []) {
    const refs = detail.sourceRefs ?? [];
    const fields = detailFields(detail);
    const type = cleanWikiField(fields.weapon_type);
    if (type)
      typeOptions.set(
        type,
        taxonomyOption(type, weaponTypeLabels.get(type) ?? type, refs),
      );
    for (const match of String(fields.damage ?? "").matchAll(
      /Damage\s*\|\s*([^|}]+)/gi,
    )) {
      const raw = match[1].trim().toLocaleLowerCase("en-US");
      const id = raw.includes("ballistic")
        ? "ballistic"
        : raw.includes("explosion")
          ? "explosion"
          : raw.includes("fire")
            ? "fire"
            : raw.includes("plasma")
              ? "plasma"
              : raw.includes("arc")
                ? "arc"
                : null;
      if (id && !ammoOptions.has(id))
        ammoOptions.set(
          id,
          taxonomyOption(id, ammoTraitLabels.get(id) ?? id, refs),
        );
    }
  }
  const attackRef = wiki.attackTaxonomy?.sourceRefs ?? [];
  return {
    version: "wiki-taxonomy.v2",
    dimensions: {
      weaponType: {
        id: "weaponType",
        labelZh: "\u6b66\u5668\u7c7b\u578b",
        valueKind: "single",
        taxonomySource: "Helldivers Wiki.gg Infobox weapon_type",
        scaleVersion: "wiki-infobox-weapon-type-v1",
        sourceRefs: [...typeOptions.values()].flatMap(
          (option) => option.sourceRefs,
        ),
        verificationStatus: "verified",
        options: [...typeOptions.values()],
      },
      ammoTraits: {
        id: "ammoTraits",
        labelZh: "\u653b\u51fb\u4ecb\u8d28",
        valueKind: "multi",
        taxonomySource: "Helldivers Wiki.gg Damage templates",
        scaleVersion: "wiki-damage-medium-v1",
        sourceRefs: [...ammoOptions.values()].flatMap(
          (option) => option.sourceRefs,
        ),
        verificationStatus: "verified",
        options: [...ammoOptions.values()],
      },
      armorPenetration: {
        id: "armorPenetration",
        labelZh: "\u7a7f\u7532 AP",
        valueKind: "number",
        taxonomySource:
          wiki.attackTaxonomy?.taxonomySource ??
          "Helldivers Wiki.gg Template:Armor",
        scaleVersion:
          wiki.attackTaxonomy?.scaleVersion ?? "wiki-armor-ap-0..10-v1",
        sourceRefs: attackRef,
        verificationStatus: "verified",
        options: (wiki.attackTaxonomy?.options ?? []).map((option) =>
          taxonomyOption(String(option.value), option.labelZh, attackRef),
        ),
        numberScale: { min: 0, max: 10, step: 1 },
      },
    },
  };
}

function weaponProfile(detail) {
  const fields = detailFields(detail);
  const isSupportWeaponStratagem =
    detail?.category === "stratagem" &&
    /\bsupport\s+weapon\b/i.test(cleanWikiField(fields.stratagem_type));
  if (
    !detail ||
    (!["primary", "secondary", "support"].includes(detail.slot) &&
      !isSupportWeaponStratagem)
  )
    return undefined;
  const refs = detail.sourceRefs ?? [];
  const type = cleanWikiField(fields.weapon_type);
  const ammoTraits = [
    ...String(fields.damage ?? "").matchAll(/Damage\s*\|\s*([^|}]+)/gi),
  ]
    .map((match) => match[1].trim().toLocaleLowerCase("en-US"))
    .map((value) =>
      value.includes("ballistic")
        ? "ballistic"
        : value.includes("explosion")
          ? "explosion"
          : value.includes("fire")
            ? "fire"
            : value.includes("plasma")
              ? "plasma"
              : value.includes("arc")
                ? "arc"
                : null,
    )
    .filter((value) => value !== null);
  return {
    ...(type
      ? {
          weaponType: {
            value: type,
            taxonomySource: "Helldivers Wiki.gg Infobox weapon_type",
            scaleVersion: "wiki-infobox-weapon-type-v1",
            sourceRefs: refs,
            verificationStatus: "verified",
          },
        }
      : {}),
    ...(ammoTraits.length
      ? {
          ammoTraits: {
            value: [...new Set(ammoTraits)],
            taxonomySource: "Helldivers Wiki.gg Damage templates",
            scaleVersion: "wiki-damage-medium-v1",
            sourceRefs: refs,
            verificationStatus: "verified",
          },
        }
      : {}),
  };
}

const genericOfficialSuffixes = new Set([
  "pistol",
  "rifle",
  "shotgun",
  "machine gun",
  "submachine gun",
  "grenade",
  "armor",
  "helmet",
  "booster",
  "stratagem",
  "support weapon",
  "smg",
  "primary weapon",
  "secondary weapon",
  "marksman rifle",
  "assault rifle",
  "energy weapon",
]);
const genericOfficialChinese = new Set([
  "手枪",
  "步枪",
  "冲锋枪",
  "霰弹枪",
  "机枪",
  "手榴弹",
  "护甲",
  "头盔",
  "强化剂",
]);
function modelToken(value) {
  return (
    String(value ?? "").match(
      /(?:[A-Z]{1,5}[-/])?[A-Z]*-?\d+[A-Z0-9]*(?:[-/][A-Z0-9]+)*/i,
    )?.[0] ?? null
  );
}

function officialNameForCanonical(nameEn, model = "") {
  const key = normalizeEnglish(nameEn);
  if (!key) return null;
  const itemModel = normalizeModel(modelToken(model) ?? modelToken(nameEn));
  const exactMatches = officialRecords.filter((record) => {
    if (record.englishKey !== key) return false;
    if (genericOfficialChinese.has(record.simplifiedChinese)) return false;
    return (
      normalize(record.simplifiedChinese) !==
      normalize(modelToken(model) ?? modelToken(nameEn))
    );
  });
  const suffixMatches = officialRecords.filter((record) => {
    if (!key.endsWith(` ${record.englishKey}`)) return false;
    if (genericOfficialSuffixes.has(record.englishKey)) return false;
    if (genericOfficialChinese.has(record.simplifiedChinese)) return false;
    const recordModel = modelToken(record.english);
    const stableModelMatch = Boolean(
      recordModel && itemModel && normalizeModel(recordModel) === itemModel,
    );
    const conciseNamedPart =
      record.englishKey.split(" ").length <= 4 &&
      String(record.english ?? "").length <= 40 &&
      !/[.!?]/.test(String(record.english));
    return stableModelMatch || conciseNamedPart;
  });
  const modelSpecificMatches = officialRecords.filter((record) => {
    const recordModel = modelToken(record.english);
    if (!recordModel || !itemModel || normalizeModel(recordModel) !== itemModel)
      return false;
    const chinese = normalize(record.simplifiedChinese);
    return (
      chinese &&
      normalize(record.simplifiedChinese) !==
        normalize(modelToken(model) ?? modelToken(nameEn)) &&
      !genericOfficialChinese.has(record.simplifiedChinese)
    );
  });
  // A model-only localization (M7S -> 冲锋枪, AR-61 -> AR-61, etc.) is not a
  // display name. Prefer a full canonical match, then a named suffix such as
  // "Stoker" or "Missile Pistol". Never let a shorter model token win merely
  // because it is an exact key.
  const matches = [
    ...new Map(
      [...exactMatches, ...suffixMatches, ...modelSpecificMatches].map(
        (record) => [record.key, record],
      ),
    ).values(),
  ].sort((left, right) => {
    const leftExact = left.englishKey === key ? 1 : 0;
    const rightExact = right.englishKey === key ? 1 : 0;
    return (
      rightExact - leftExact || right.englishKey.length - left.englishKey.length
    );
  });
  const record = matches[0];
  return record
    ? {
        candidateZh: record.simplifiedChinese,
        record,
      }
    : null;
}

function communityOverlayFor(detail) {
  if (!detail) return null;
  const canonicalRecord = translationById.get(detail.id);
  const legacyOverlay = canonicalRecord?.legacyCommunityIds
    ?.map((id) => communityById.get(id))
    .find(Boolean);
  return (
    communityById.get(detail.id) ??
    legacyOverlay ??
    communityByModel.get(
      normalizeModel(detail.model ?? detailFields(detail).model),
    ) ??
    null
  );
}

function translationRecordFor(detail, overlay) {
  return (
    p0_3TranslationById.get(detail?.id) ??
    p0_2TranslationById.get(detail?.id) ??
    translationById.get(detail?.id) ??
    (detail?.model
      ? translationByModel.get(normalizeModel(detail.model))
      : null) ??
    (overlay?.id ? translationById.get(overlay.id) : null) ??
    null
  );
}

function translationCandidateZh(record) {
  return record ? (record.candidateZh ?? record.proposedNameZh ?? "") : null;
}

function translationSupportSourceIds(record) {
  return record?.supportSourceIds ?? record?.sourceIds ?? [];
}

function translationCapturedAt(record) {
  if (p0_3TranslationById.has(record?.canonicalId))
    return p0_3Translation.capturedAt;
  return p0_2TranslationById.has(record?.canonicalId)
    ? p0_2Translation.capturedAt
    : translationEvidence.capturedAt;
}

function officialEvidence(detail, official) {
  if (!official) return null;
  const canonicalEnglish = detail?.nameEn ?? "";
  const sourceFiles = officialLocalization.sourceFiles ?? [];
  const simplifiedFiles = sourceFiles.filter(
    (file) => file.language === "schinese",
  );
  const evidenceRefs = simplifiedFiles.map((file) =>
    sourceRef(
      `Official schinese strings ${file.fileName} sha256=${file.sha256}`,
      undefined,
      "game-data",
    ),
  );
  return {
    canonicalEnglish,
    candidateZh: official.candidateZh,
    platform: "官方简中游戏资源",
    evidenceRefs,
    hitKeywords: [detail.nameEn, official.candidateZh],
    searchedAt: officialLocalization.extractedAt ?? "unknown",
    confidence: "high",
    status: "official",
  };
}

function translate(item, detail, overlay) {
  const rawOfficial = officialNameForCanonical(item.nameEn, item.model);
  const official =
    rawOfficial &&
    normalize(rawOfficial.candidateZh) !==
      normalizeModel(item.model ?? modelToken(item.nameEn))
      ? rawOfficial
      : null;
  const officialRecord = officialEvidence(
    detail ?? { nameEn: item.nameEn },
    official,
  );
  const record = translationRecordFor(detail, overlay);
  if (officialRecord) {
    const evidence = [officialRecord];
    if (record && record.status !== "pending") {
      const evidenceRefs = translationSupportSourceIds(record)
        .map((id) => translationSourceById.get(id))
        .filter(Boolean)
        .map((source) => ({
          kind: source.kind,
          label: source.label,
          url: source.url,
          capturedAt: translationCapturedAt(record),
          retrievedAt: translationCapturedAt(record),
        }));
      evidence.push({
        canonicalEnglish: record.canonicalEnglish,
        candidateZh: translationCandidateZh(record),
        platform: translationSupportSourceIds(record)
          .map((id) => translationSourceById.get(id)?.level)
          .filter(Boolean)
          .join(" + "),
        evidenceRefs,
        hitKeywords: record.hitKeywords ?? [
          record.canonicalEnglish,
          translationCandidateZh(record),
        ],
        searchedAt: translationCapturedAt(record),
        confidence: record.status === "official" ? "high" : "medium",
        status:
          record.status === "official" ? "official" : "verified-community",
      });
    }
    return evidence;
  }
  if (!record) {
    return [
      {
        canonicalEnglish: item.nameEn,
        candidateZh: item.nameZh,
        platform: "小黑盒用户提供转录",
        evidenceRefs: [communitySource],
        hitKeywords: [item.nameEn, item.nameZh, ...item.aliases],
        searchedAt: community.submittedAt ?? "2026-08-08T00:00:00.000Z",
        confidence: "low",
        status: "pending",
      },
    ];
  }
  const evidenceRefs = translationSupportSourceIds(record)
    .map((id) => translationSourceById.get(id))
    .filter(Boolean)
    .map((source) => ({
      kind: source.kind,
      label: source.label,
      url: source.url,
      capturedAt: translationCapturedAt(record),
      retrievedAt: translationCapturedAt(record),
    }));
  return [
    {
      canonicalEnglish: record.canonicalEnglish,
      candidateZh: translationCandidateZh(record),
      platform: translationSupportSourceIds(record)
        .map((id) => translationSourceById.get(id)?.level)
        .filter(Boolean)
        .join(" + "),
      evidenceRefs,
      hitKeywords: record.hitKeywords ?? [
        record.canonicalEnglish,
        translationCandidateZh(record),
      ],
      searchedAt: translationCapturedAt(record),
      confidence:
        record.status === "official"
          ? "high"
          : record.status === "verified-community"
            ? "medium"
            : "low",
      status:
        record.status === "official"
          ? "official"
          : record.status === "verified-community"
            ? "verified-community"
            : "pending",
      ...(record.conflictNote ? { conflictNote: record.conflictNote } : {}),
    },
  ];
}

function searchFields(item) {
  const aliases = item.aliases.map((alias) => normalize(alias.text));
  const modelAliasCombinations = item.aliases.map((alias) =>
    normalize(`${item.model}${alias.text}`),
  );
  const candidates = [item.nameZh, ...item.aliases.map((alias) => alias.text)];
  return {
    model: normalize(item.model),
    modelFormalName: normalize(`${item.model}${item.nameZh}`),
    formalName: normalize(item.nameZh),
    englishName: normalize(item.nameEn),
    aliases: [...new Set([...aliases, ...modelAliasCombinations])],
    pinyinFull: candidates.map(toPinyin).map(normalize),
    pinyinInitials: candidates.map(initials).map(normalize),
  };
}

function toAsset(item, detail) {
  const manifestAsset =
    detail?.asset ??
    assetsByItemId.get(detail?.id ?? item.id) ??
    assetsByFileTitle.get(detail?.imageFileTitle);
  if (!manifestAsset?.path) return { ...placeholder, alt: item.nameZh };
  return {
    ...placeholder,
    ...manifestAsset,
    alt: item.nameZh,
    sourceRefs: manifestAsset.sourceRefs ?? placeholder.sourceRefs,
  };
}

function normalizeItem(item, detail = wikiById.get(item.id)) {
  const human =
    communityOverlayFor(detail) ?? communityById.get(item.id) ?? item;
  const override = overrideById.get(item.id) ?? {};
  const effective = {
    ...human,
    ...override,
    aliases: override.aliases ?? human.aliases ?? [],
  };
  const translationRecord = translationRecordFor(detail, human);
  const detailNameEn = detail?.nameEn ?? "";
  const nameEn =
    (!detailNameEn || /^\([^)]*\)$/.test(detailNameEn.trim())
      ? effective.nameEn
      : detailNameEn) ??
    item.nameEn ??
    "";
  const fields = detailFields(detail);
  const model =
    detail?.model ??
    fields.model ??
    p0_3TranslationById.get(detail?.id)?.model ??
    p0_2TranslationById.get(detail?.id)?.model ??
    effective.model ??
    "";
  const official = officialNameForCanonical(nameEn, detail?.model ?? "");
  const officialModelText = normalizeModel(model || modelToken(nameEn));
  const usableOfficial =
    official && normalize(official.candidateZh) !== officialModelText
      ? official
      : null;
  const nameZh =
    translationCandidateZh(translationRecord) ??
    usableOfficial?.candidateZh ??
    (normalize(effective.nameZh) === officialModelText
      ? ""
      : effective.nameZh) ??
    "";
  const aliasTexts = cleanAliases([
    ...effective.aliases.map((alias) =>
      typeof alias === "string" ? alias : alias.text,
    ),
    ...(human.nameZh && normalize(human.nameZh) !== normalize(nameZh)
      ? [human.nameZh]
      : []),
  ]);
  const category =
    detail?.category ??
    effective.category ??
    (detail?.slot === "armor"
      ? "armor"
      : detail?.slot === "stratagem"
        ? "stratagem"
        : detail?.slot === "throwable"
          ? "grenade"
          : "weapon");
  const slot = detail?.slot ?? effective.slot;
  const sourceAcquisition =
    override.acquisition ??
    detail?.acquisition ??
    (effective.warbondId
      ? {
          kind: "warbond",
          warbondId: effective.warbondId,
          page: null,
          itemMedals: null,
          pageUnlockMedals: null,
        }
      : { kind: "other", label: "未解析", status: "pending" });
  const thresholdRecord =
    sourceAcquisition.kind === "warbond"
      ? warbondPageThresholdsById.get(sourceAcquisition.warbondId)
      : null;
  const pageThreshold = thresholdRecord?.pages?.find(
    (entry) => entry.page === sourceAcquisition.page,
  );
  const acquisition = pageThreshold
    ? {
        ...sourceAcquisition,
        pageIncrementalMedals: pageThreshold.incrementalMedals,
        pageUnlockMedals: pageThreshold.cumulativeMedals,
        sourceRefs: [
          ...(sourceAcquisition.sourceRefs ?? []),
          ...(thresholdRecord.sourceRefs ?? []),
        ],
      }
    : sourceAcquisition;
  const rawTranslationEvidence = translate(
    {
      ...effective,
      nameEn,
      model,
      aliases: effective.aliases,
    },
    detail ?? { nameEn },
    human,
  );
  const translationEvidence = rawTranslationEvidence.filter(
    (entry) =>
      !(
        entry.status === "official" &&
        normalize(entry.candidateZh) === officialModelText
      ),
  );
  const normalizedItem = {
    id: detail?.id ?? item.id,
    model,
    nameZh,
    nameEn,
    category,
    slot,
    image: toAsset(effective, detail),
    aliases: aliasTexts.map((alias) => ({
      text: alias,
      kind: "community",
      sourceRefs: [communitySource],
      reviewStatus: "verified",
    })),
    acquisition,
    sourceRefs: [
      ...(detail?.sourceRefs ?? []),
      ...(human?.id && communityById.has(human.id) ? [communitySource] : []),
    ],
    verificationStatus: detail ? "verified" : "pending",
    admissionStatus: "quarantine",
    translationEvidence,
    notes: detail?.potentiallyOutdated
      ? "Wiki 页面标记 Potentially Outdated；该条目保持审慎状态。"
      : "",
    search: {
      model: "",
      modelFormalName: "",
      formalName: "",
      englishName: "",
      aliases: [],
      pinyinFull: [],
      pinyinInitials: [],
    },
    ...(detail?.attackProfile ? { attackProfile: detail.attackProfile } : {}),
    ...(detail?.handlingStats ? { handlingStats: detail.handlingStats } : {}),
    ...(weaponProfile(detail) ? { weaponProfile: weaponProfile(detail) } : {}),
    ...(fields.armor || fields.passive
      ? {
          stats: {
            armor: Number(fields.armor) || undefined,
            passive: fields.passive
              ? fields.passive.replace(/\[\[|\]\]/g, "")
              : undefined,
          },
        }
      : {}),
  };
  const wikiUrl = selectEquipmentWikiUrl({
    ...normalizedItem,
    canonicalTitle: detail?.canonicalTitle,
  });
  if (wikiUrl) normalizedItem.wikiUrl = wikiUrl;
  const admitted = Boolean(
    nameEn &&
    normalizedItem.nameZh &&
    normalize(normalizedItem.nameZh) !== normalize(model) &&
    slot &&
    translationReady(translationEvidence) &&
    acquisitionReady(acquisition) &&
    !acquisition.conflictRefs?.length &&
    normalizedItem.wikiUrl &&
    attackReady(normalizedItem),
  );
  normalizedItem.admissionStatus = admitted ? "admitted" : "quarantine";
  if (!admitted)
    normalizedItem.quarantineReason = [
      !nameEn && "缺少 Wiki canonical name",
      !normalizedItem.nameZh && "缺少可靠中文显示名",
      !slot && "缺少类别/槽位",
      !translationReady(translationEvidence) && "中文名尚未完成独立交叉证据",
      !acquisitionReady(acquisition) && "获取来源或价格字段不完整",
      acquisition.conflictRefs?.length && "获取来源存在冲突",
      !attackReady(normalizedItem) && "缺少核心速查参数",
    ]
      .filter(Boolean)
      .join("；");
  normalizedItem.search = searchFields(normalizedItem);
  return normalizedItem;
}

const frozenWikiItems = (wiki.items ?? []).map((detail) =>
  normalizeItem(detail, detail),
);
const wikiModelKeys = new Set(
  (wiki.items ?? [])
    .map((detail) =>
      normalizeModel(detail.model ?? detailFields(detail).model ?? ""),
    )
    .filter(Boolean),
);
const legacyCommunityIds = new Set(
  (translationEvidence.records ?? []).flatMap(
    (record) => record.legacyCommunityIds ?? [],
  ),
);
const communityOnlyItems = (community.equipment ?? [])
  .filter(
    (item) =>
      !wikiById.has(item.id) &&
      !legacyCommunityIds.has(item.id) &&
      !wikiModelKeys.has(normalizeModel(item.model ?? "")),
  )
  .map((item) => normalizeItem(item));
const rawAllItems = [...frozenWikiItems, ...communityOnlyItems];
const scopeByItemId = new Map();
for (const item of rawAllItems) {
  const scope = classifyProductScope(item);
  item.scopeClass = scope.scopeClass;
  item.productGroup = scope.productGroup;
  if (scope.reason) item.scopeReason = scope.reason;
  scopeByItemId.set(item.id, scope);
}
const allItems = rawAllItems.filter(
  (item) => scopeByItemId.get(item.id)?.scopeClass !== "out-of-product-scope",
);
const supportedCategories = new Set([
  "weapon",
  "armor",
  "grenade",
  "stratagem",
]);
const wikiDetailByTitle = new Map(
  (wiki.items ?? []).map((detail) => [
    normalize(detail.canonicalTitle),
    detail,
  ]),
);
const allItemsById = new Map(allItems.map((item) => [item.id, item]));
const contentsTypeMatches = (type, category) => {
  const value = String(type ?? "").toLowerCase();
  if (!value) return true;
  if (category === "armor") return /armor/.test(value) && !/helmet/.test(value);
  if (category === "grenade") return /throwable|grenade/.test(value);
  if (category === "weapon")
    return /weapon|launcher|pistol|rifle|shotgun|submachine|melee|energy|special|explosive|assault|marksman|sniper|machine|sickle|smg|primary|secondary|throwing|knife/.test(
      value,
    );
  if (category === "stratagem")
    return /stratagem|vehicle|backpack|sentry|mortar|support/.test(value);
  return false;
};
const resolveContentsDetail = (warbondId, page, entry) => {
  const alias = warbondContentAliasByKey.get(
    `${warbondId}:${page}:${normalize(entry.canonicalTitle)}`,
  );
  const detail = alias
    ? wikiById.get(alias.canonicalId)
    : wikiDetailByTitle.get(normalize(entry.canonicalTitle));
  if (!detail || !supportedCategories.has(detail.category)) return null;
  if (!alias && !contentsTypeMatches(entry.type, detail.category)) return null;
  return { detail, alias: alias ?? null };
};
const warbondContentsCoverage = (wiki.warbonds ?? []).map((warbond) => {
  const contents = (wiki.warbondContents ?? []).find(
    (entry) => entry.warbondId === warbond.id,
  );
  const expectedById = new Map();
  for (const page of contents?.pages ?? []) {
    for (const entry of page.entries ?? []) {
      const resolved = resolveContentsDetail(warbond.id, page.page, entry);
      if (!resolved) continue;
      const { detail, alias } = resolved;
      const existing = expectedById.get(detail.id);
      if (
        !existing ||
        (existing.itemMedals === null && entry.itemMedals !== null)
      )
        expectedById.set(detail.id, {
          id: detail.id,
          canonicalTitle: detail.canonicalTitle,
          contentsTitle: entry.canonicalTitle,
          page: page.page,
          itemMedals: entry.itemMedals,
          alias,
        });
    }
  }
  const expected = [...expectedById.values()];
  const ambiguityCount = (contents?.pages ?? []).reduce(
    (sum, page) => sum + (page.ambiguityCount ?? 0),
    0,
  );
  const catalogItemsForBond = allItems.filter(
    (item) =>
      item.admissionStatus === "admitted" &&
      item.acquisition?.kind === "warbond" &&
      item.acquisition?.warbondId === warbond.id,
  );
  const expectedIds = expected.map((entry) => entry.id).sort();
  const catalogIds = catalogItemsForBond.map((item) => item.id).sort();
  const expectedSet = new Set(expectedIds);
  const catalogSet = new Set(catalogIds);
  const missingFromAdmitted = expectedIds.filter((id) => !catalogSet.has(id));
  const catalogExtras = catalogIds.filter((id) => !expectedSet.has(id));
  const fieldMismatches = expected.flatMap((entry) => {
    const item = allItemsById.get(entry.id);
    const acquisition = item?.acquisition;
    const mismatch =
      !item ||
      acquisition?.kind !== "warbond" ||
      acquisition.warbondId !== warbond.id ||
      acquisition.page !== entry.page ||
      acquisition.itemMedals !== entry.itemMedals
        ? {
            id: entry.id,
            expected: {
              warbondId: warbond.id,
              page: entry.page,
              itemMedals: entry.itemMedals,
            },
            actual: acquisition
              ? {
                  warbondId: acquisition.warbondId,
                  page: acquisition.page,
                  itemMedals: acquisition.itemMedals,
                }
              : null,
          }
        : null;
    return mismatch ? [mismatch] : [];
  });
  const upcoming =
    expected.length > 0 &&
    expected.every(
      (entry) => scopeByItemId.get(entry.id)?.scopeClass === "upcoming",
    );
  return {
    warbondId: warbond.id,
    nameEn: warbond.nameEn ?? null,
    parsed: Boolean(contents?.pages?.length),
    contentsSupportedCount: expected.length,
    normalizedCount: expected.length,
    admittedCount: catalogItemsForBond.length,
    availability: upcoming ? "upcoming" : "released",
    expectedIds,
    catalogIds,
    symmetricDiff: {
      missing: missingFromAdmitted,
      extra: catalogExtras,
    },
    fieldMismatches,
    aliasResolutions: expected
      .filter((entry) => entry.alias)
      .map((entry) => entry.alias),
    ambiguityCount,
    fallbackCount: 0,
    missingFromAdmitted,
    parity:
      upcoming ||
      (Boolean(contents?.pages?.length) &&
        ambiguityCount === 0 &&
        missingFromAdmitted.length === 0 &&
        catalogExtras.length === 0 &&
        fieldMismatches.length === 0),
  };
});
const catalog = {
  meta: {
    game: "HELLDIVERS 2",
    gameBuild:
      wiki.pages
        ?.map?.(
          (page) =>
            page.wikitext?.match?.(/\{\{Last Updated\|([^}]+)\}\}/i)?.[1],
        )
        .filter(Boolean)
        .sort()
        .at(-1) ?? "wiki-revision",
    dataVersion: `0.3.0-wiki.${wiki.version}`,
    generatedAt: new Date().toISOString(),
    verificationStatus: "verified",
    unresolvedDifferences: [
      "正式目录只包含通过 admission gate 的条目；其余 Wiki/社区映射保留在 quarantine。",
      "Wiki.gg 是英文事实核心来源；正式中文名优先使用官方游戏简中资源，小黑盒仅补充外号和社区术语。",
      "图片许可、来源和哈希按文件单独记录；缺失时使用项目自制占位图。",
    ],
  },
  taxonomy: {
    ...makeTaxonomy(),
  },
  attackTaxonomy: wiki.attackTaxonomy,
  warbonds,
  items: allItems.filter((item) => item.admissionStatus === "admitted"),
  quarantine: allItems.filter((item) => item.admissionStatus !== "admitted"),
  glossaryTerms: community.glossaryTerms.map((term) => ({
    ...term,
    sourceRefs: [communitySource],
    verificationStatus: "pending",
  })),
  currencies: (wiki.currencies ?? []).map((currency) => {
    const iconPath =
      {
        medals: "assets/wiki/currency-medals.svg",
        "requisition-slips": "assets/wiki/currency-requisition-slips.svg",
        "super-credits": "assets/wiki/currency-super-credits.svg",
      }[currency.type] ?? "assets/placeholder-equipment.svg";
    const icon = assetsByPath.get(iconPath);
    return {
      type: currency.type,
      labelZh:
        {
          medals: "勋章",
          "requisition-slips": "征用点",
          "super-credits": "超级货币",
        }[currency.type] ?? currency.type,
      iconAssetPath: iconPath,
      sourceRefs: [...(currency.sourceRefs ?? []), ...(icon?.sourceRefs ?? [])],
    };
  }),
  coverage: {
    wikiDiscovered: wiki.coverage?.wikiDiscovered ?? 0,
    normalized: wiki.coverage?.total ?? wiki.coverage?.normalized ?? 0,
    admitted: allItems.filter((item) => item.admissionStatus === "admitted")
      .length,
    quarantined: allItems.filter((item) => item.admissionStatus !== "admitted")
      .length,
    translationEvidence: allItems.filter(
      (item) => item.translationEvidence.length > 0,
    ).length,
    acquisitionComplete: allItems.filter((item) =>
      acquisitionReady(item.acquisition),
    ).length,
    imageCovered: allItems.filter((item) => item.image.status === "verified")
      .length,
    attackParameters: allItems.filter(attackReady).length,
    warbondContentsCoverage,
  },
};
const formatted = await prettier.format(JSON.stringify(catalog), {
  parser: "json",
});
await writeFile(outputPath, formatted, "utf8");
const auditKeys = new Set([
  "sourceRefs",
  "translationEvidence",
  "notes",
  "quarantineReason",
  "verificationStatus",
]);
const compactRuntime = (value) => {
  if (Array.isArray(value)) return value.map(compactRuntime);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !auditKeys.has(key))
      .map(([key, entry]) => [key, compactRuntime(entry)]),
  );
};
const runtimeCatalog = compactRuntime(catalog);
const compactEquipment = (item) => ({
  ...compactRuntime(item),
  ...(item.wikiUrl ? { wikiUrl: item.wikiUrl } : {}),
  image: {
    path: item.image.path,
    status: item.image.status,
    alt: item.image.alt,
  },
});
runtimeCatalog.items = catalog.items.map((item) => ({
  ...compactEquipment(item),
}));
runtimeCatalog.quarantine = catalog.quarantine.map((item) => ({
  ...compactEquipment(item),
}));
const formattedRuntime = await prettier.format(JSON.stringify(runtimeCatalog), {
  parser: "json",
});
await writeFile(runtimeOutputPath, formattedRuntime, "utf8");
console.log(
  `Generated ${catalog.items.length} admitted items and ${catalog.quarantine.length} quarantined items.`,
);
