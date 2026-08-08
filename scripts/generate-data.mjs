import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import prettier from "prettier";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "src/data/source/catalog-source.json");
const communityAliasPath = resolve(
  root,
  "src/data/source/xiaoheihe-community-aliases.json",
);
const overridesPath = resolve(root, "src/data/overrides/manual-overrides.json");
const assetManifestPath = resolve(root, "src/data/assets/manifest.json");
const outputPath = resolve(root, "src/data/catalog.json");

const pinyin = {
  样: "yang",
  例: "li",
  脉: "mai",
  冲: "chong",
  器: "qi",
  壳: "ke",
  甲: "jia",
  战: "zhan",
  地: "di",
  包: "bao",
  破: "po",
  片: "pian",
  雷: "lei",
  强: "qiang",
  化: "hua",
  剂: "ji",
  债: "zhai",
  券: "quan",
  待: "dai",
  核: "he",
  验: "yan",
  示: "shi",
  范: "fan",
  默: "mo",
  认: "ren",
  记: "ji",
  录: "lu",
  仅: "jin",
  用: "yong",
  于: "yu",
  展: "zhan",
  数: "shu",
  据: "ju",
  结: "jie",
  构: "gou",
  的: "de",
  不: "bu",
  是: "shi",
  已: "yi",
  样: "yang",
  本: "ben",
  商: "shang",
  店: "dian",
  轮: "lun",
  换: "huan",
  价: "jia",
  格: "ge",
  状: "zhuang",
  态: "tai",
  均: "jun",
  未: "wei",
  给: "gei",
  出: "chu",
  可: "ke",
  获: "huo",
  取: "qu",
  来: "lai",
  源: "yuan",
  仅: "jin",
  演: "yan",
  示: "shi",
  获: "huo",
  取: "qu",
  方: "fang",
  式: "shi",
  默: "mo",
  认: "ren",
  设: "she",
  备: "bei",
  级: "ji",
  征: "zheng",
  用: "yong",
  点: "dian",
  商: "shang",
  超: "chao",
  级: "ji",
  货: "huo",
  币: "bi",
  费: "fei",
  免: "mian",
  责: "ze",
  任: "ren",
  说: "shuo",
  明: "ming",
  未: "wei",
  知: "zhi",
  现: "xian",
  当: "dang",
  前: "qian",
  游: "you",
  戏: "xi",
  名: "ming",
  称: "cheng",
  模: "mo",
  型: "xing",
  价: "jia",
  需: "xu",
  求: "qiu",
  与: "yu",
  无: "wu",
  关: "guan",
  联: "lian",
  只: "zhi",
  为: "wei",
  演: "yan",
  示: "shi",
  可: "ke",
  获: "huo",
  取: "qu",
  来: "lai",
  源: "yuan",
};

function normalize(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function toPinyin(value) {
  return [...value]
    .map(
      (character) =>
        pinyin[character] ?? (/[\x00-\x7f]/.test(character) ? character : ""),
    )
    .join("");
}

function initials(value) {
  return [...value]
    .map(
      (character) =>
        pinyin[character]?.[0] ??
        (/[\x00-\x7f]/.test(character) ? character : ""),
    )
    .join("");
}

function buildSearchFields(item) {
  const aliases = item.aliases.map((alias) => normalize(alias.text));
  const chineseCandidates = [
    item.nameZh,
    ...item.aliases.map((alias) => alias.text),
  ];
  return {
    model: normalize(item.model),
    modelFormalName: normalize(`${item.model}${item.nameZh}`),
    formalName: normalize(item.nameZh),
    englishName: normalize(item.nameEn),
    aliases,
    pinyinFull: chineseCandidates.map(toPinyin).map(normalize),
    pinyinInitials: chineseCandidates.map(initials).map(normalize),
  };
}

const catalog = JSON.parse(await readFile(sourcePath, "utf8"));
const communityAliases = JSON.parse(await readFile(communityAliasPath, "utf8"));
const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
const assetManifest = JSON.parse(await readFile(assetManifestPath, "utf8"));
const assetsByPath = new Map(
  (assetManifest.assets ?? []).map((asset) => [asset.path, asset]),
);

const communitySource = communityAliases.sourceRef;
const placeholderImage = {
  path: "assets/placeholder-equipment.svg",
  alt: "装备图片待补充",
  status: "placeholder",
  sourceRefs: [{ kind: "local-fixture", label: "项目自制通用占位图" }],
  licenseStatus: "project-created-placeholder",
};

catalog.meta = {
  ...catalog.meta,
  dataVersion: `0.2.0-community.${communityAliases.version}`,
  generatedAt: "2026-08-08T00:00:00.000Z",
  verificationStatus: "pending",
  unresolvedDifferences: [
    "正式中文名、型号、债券归属与外号来自一篇社区整理帖，尚待游戏简体中文资源逐项复核。",
    "债券页码、页面勋章门槛、物品价格、战备征用点价格及英文名尚未核验。",
    "武器分类、弹药属性、穿甲等级与拆毁值没有可靠统一来源，因此保持空白且不进入筛选。",
    "装备图片仍为项目自制占位图，等待具有明确许可与来源的素材。",
  ],
};
catalog.warbonds = communityAliases.warbonds.map((warbond) => ({
  ...warbond,
  kind: "warbond",
  superCredits: null,
  sourceRefs: [communitySource],
  verificationStatus: "pending",
}));
catalog.items = communityAliases.equipment.map((item) => ({
  id: item.id,
  model: item.model,
  nameZh: item.nameZh,
  nameEn: "待核验",
  category: item.category,
  image: placeholderImage,
  aliases: item.aliases.map((alias) => ({
    text: alias,
    kind: "community",
    sourceRefs: [communitySource],
    reviewStatus: "verified",
  })),
  acquisition: item.warbondId
    ? {
        kind: "warbond",
        warbondId: item.warbondId,
        page: null,
        itemMedals: null,
        pageUnlockMedals: null,
      }
    : {
        kind: "other",
        label: "帖子未注明获取方式",
        status: "pending",
      },
  sourceRefs: [communitySource],
  verificationStatus: "pending",
  notes:
    "中文名称、型号与俗称来自用户提供的社区帖全文；社区用法已有出处，但仍需用游戏简体中文资源复核正式名与获取数据。",
}));
catalog.glossaryTerms = communityAliases.glossaryTerms.map((term) => ({
  ...term,
  sourceRefs: [communitySource],
  verificationStatus: "pending",
}));
const sourceIds = new Set(catalog.items.map((item) => item.id));
for (const override of overrides.items ?? []) {
  if (!sourceIds.has(override.id))
    throw new Error(`Manual override references unknown item: ${override.id}`);
  if (override.verificationStatus !== "verified")
    throw new Error(
      `Manual override must be verified before generation: ${override.id}`,
    );
  if (!Array.isArray(override.sourceRefs) || override.sourceRefs.length === 0)
    throw new Error(`Manual override has no sourceRefs: ${override.id}`);
}
const overrideMap = new Map(
  (overrides.items ?? []).map((override) => [override.id, override]),
);
catalog.items = catalog.items.map((item) => {
  const override = overrideMap.get(item.id);
  if (!override) return item;
  const {
    id: _id,
    verificationStatus: _status,
    sourceRefs: _sources,
    ...fields
  } = override;
  return {
    ...item,
    ...fields,
    sourceRefs: override.sourceRefs,
    verificationStatus: override.verificationStatus,
  };
});
catalog.items = catalog.items.map((item) => ({
  ...item,
  image: {
    originalPage: null,
    author: "HD2 军需簿 contributors",
    syncedAt: catalog.meta.generatedAt,
    fileHash: null,
    ...(assetsByPath.get(item.image.path) ?? {}),
    ...item.image,
  },
  search: buildSearchFields(item),
}));
await mkdir(dirname(outputPath), { recursive: true });
const formatted = await prettier.format(JSON.stringify(catalog), {
  parser: "json",
});
await writeFile(outputPath, formatted, "utf8");
console.log(
  `Generated ${catalog.items.length} catalog items with build-time search fields.`,
);
