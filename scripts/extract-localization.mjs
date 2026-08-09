import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import prettier from "prettier";

const root = resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  args.set(value.slice(2), process.argv[index + 1]);
  index += 1;
}

const inputDir = resolve(args.get("input") ?? "");
const outputPath = resolve(
  root,
  args.get("output") ?? "src/data/source/official-localization.json",
);
const englishSpec = args.get("english");
const simplifiedSpec = args.get("simplified");
const warbondSpec = args.get("warbond");
const gameBuild = args.get("game-build") ?? "unknown";
const extractedAt = args.get("extracted-at") ?? new Date().toISOString();
const toolVersion = args.get("tool-version") ?? "FileDiver v0.7.36";
const toolSha256 =
  args.get("tool-sha256") ??
  "0B64900876DCD232A45A6E2D583193610DA536DF40B4D39303B7ECDEB79AA528";

if (!englishSpec || !simplifiedSpec) {
  throw new Error(
    "Usage: node scripts/extract-localization.mjs --input <dir> --english <dir|file> --simplified <dir|file> [--warbond <file>]",
  );
}

const REGISTRY = [
  {
    id: "equipment-primary",
    english: [
      "0x4f68a1db55e6da09.strings.json",
      "0x7c7587b563f10985.strings.json",
    ],
    simplified: ["0x95ee90e8062250a6.strings.json"],
    anchors: [
      {
        key: 563225959,
        english: "Cremator",
        simplifiedChinese: "\u711a\u71c3\u8005",
      },
    ],
  },
];

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[“”‘’]/gu, "")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US")
    .replace(/saviour/gu, "savior")
    .replace(/marshall/gu, "marshal")
    .trim();

async function resolveSpec(spec) {
  const path = resolve(inputDir, spec);
  const info = await stat(path);
  if (info.isFile()) return new Map([[basename(path), path]]);
  if (!info.isDirectory())
    throw new Error(`${spec} is not a file or directory`);
  const names = (await readdir(path)).filter((name) =>
    name.endsWith(".strings.json"),
  );
  return new Map(names.map((name) => [name, resolve(path, name)]));
}

async function readResource(path) {
  const buffer = await readFile(path);
  const parsed = JSON.parse(buffer.toString("utf8"));
  if (!Array.isArray(parsed.Items))
    throw new Error(`${basename(path)} does not contain an Items array`);
  const values = new Map();
  for (const entry of parsed.Items) {
    if (!Number.isInteger(entry.Key) || typeof entry.Value !== "string")
      continue;
    const value = entry.Value.trim();
    if (!value) continue;
    const existing = values.get(entry.Key) ?? [];
    if (!existing.includes(value)) existing.push(value);
    values.set(entry.Key, existing);
  }
  return {
    path,
    fileName: basename(path),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    values,
    keys: new Set(values.keys()),
  };
}

function assertEquivalent(primary, candidate, role) {
  if (primary.keys.size !== candidate.keys.size)
    throw new Error(
      `${role} resource ${candidate.fileName} key count differs from ${primary.fileName}`,
    );
  for (const key of primary.keys) {
    if (!candidate.keys.has(key))
      throw new Error(
        `${role} resource ${candidate.fileName} is not key-equivalent`,
      );
  }
}

function assertAnchors(english, simplified, anchors) {
  for (const anchor of anchors) {
    const en = english.values.get(anchor.key)?.[0];
    const zh = simplified.values.get(anchor.key)?.[0];
    if (en !== anchor.english || zh !== anchor.simplifiedChinese)
      throw new Error(
        `Localization anchor ${anchor.key} mismatch: ${JSON.stringify({ en, zh })}`,
      );
  }
}

async function selectRegisteredResource(files, names, role) {
  const primaryName = names[0];
  const primaryPath = files.get(primaryName);
  if (!primaryPath)
    throw new Error(`Missing registered ${role} resource ${primaryName}`);
  const primary = await readResource(primaryPath);
  const equivalentFiles = [];
  for (const name of names.slice(1)) {
    const path = files.get(name);
    if (!path) continue;
    const candidate = await readResource(path);
    assertEquivalent(primary, candidate, role);
    equivalentFiles.push({
      fileName: candidate.fileName,
      sha256: candidate.sha256,
    });
  }
  return { ...primary, equivalentFiles };
}

const englishFiles = await resolveSpec(englishSpec);
const simplifiedFiles = await resolveSpec(simplifiedSpec);
const selectedPairs = [];
const recordsByIdentity = new Map();
for (const entry of REGISTRY) {
  const english = await selectRegisteredResource(
    englishFiles,
    entry.english,
    `${entry.id} English`,
  );
  const simplified = await selectRegisteredResource(
    simplifiedFiles,
    entry.simplified,
    `${entry.id} Simplified Chinese`,
  );
  assertAnchors(english, simplified, entry.anchors);
  let sharedKeys = 0;
  for (const key of english.keys) {
    if (!simplified.keys.has(key)) continue;
    sharedKeys += 1;
    const englishValues = english.values.get(key) ?? [];
    const simplifiedValues = simplified.values.get(key) ?? [];
    if (!simplifiedValues.length) continue;
    const identity = `${key}\u0000${englishValues.join("\u0001")}\u0000${simplifiedValues.join("\u0001")}`;
    if (recordsByIdentity.has(identity)) continue;
    recordsByIdentity.set(identity, {
      resourcePair: `${english.fileName}::${simplified.fileName}`,
      englishFile: english.fileName,
      englishSha256: english.sha256,
      simplifiedFile: simplified.fileName,
      simplifiedSha256: simplified.sha256,
      gameBuild,
      key,
      english: englishValues[0],
      simplifiedChinese: simplifiedValues[0],
      englishValues,
      simplifiedChineseValues: simplifiedValues,
    });
  }
  selectedPairs.push({
    registryId: entry.id,
    englishFile: english.fileName,
    englishSha256: english.sha256,
    englishEquivalentFiles: english.equivalentFiles,
    simplifiedFile: simplified.fileName,
    simplifiedSha256: simplified.sha256,
    simplifiedEquivalentFiles: simplified.equivalentFiles,
    sharedKeys,
  });
}

const records = [...recordsByIdentity.values()].sort(
  (left, right) =>
    left.resourcePair.localeCompare(right.resourcePair) || left.key - right.key,
);

let warbondRecords = [];
if (warbondSpec) {
  const warbondFiles = await resolveSpec(warbondSpec);
  const warbondPath = [...warbondFiles.values()][0];
  const warbond = await readResource(warbondPath);
  warbondRecords = [...warbond.values].flatMap(([key, values]) =>
    values.length
      ? [{ resourceFile: warbond.fileName, key, simplifiedChinese: values[0] }]
      : [],
  );
}

const sourceFiles = [];
for (const pair of selectedPairs) {
  for (const file of [pair.englishFile, pair.simplifiedFile]) {
    const source =
      file === pair.englishFile ? pair.englishSha256 : pair.simplifiedSha256;
    const language = file === pair.englishFile ? "en-US" : "schinese";
    if (
      !sourceFiles.some(
        (item) => item.fileName === file && item.sha256 === source,
      )
    )
      sourceFiles.push({ language, fileName: file, sha256: source });
  }
}

const output = {
  schemaVersion: "official-localization.v1",
  game: "HELLDIVERS 2",
  gameBuild,
  language: "schinese",
  extractedAt,
  extractionTool: { name: toolVersion, sha256: toolSha256 },
  sourceRegistry: REGISTRY.map((entry) => ({
    id: entry.id,
    englishCandidates: entry.english,
    simplifiedCandidates: entry.simplified,
  })),
  sourceFiles,
  alignment: {
    keyField: "Items[].Key",
    valueField: "Items[].Value",
    rule: "Only manually registered en-US/schinese resource pairs are joined by integer Items[].Key; unregistered language exports are not inferred.",
    pairedResources: selectedPairs,
    unpairedEnglishFiles: [],
    unpairedSimplifiedFiles: [],
    ambiguousPairs: [],
  },
  records,
  warbondRecords,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  await prettier.format(JSON.stringify(output), { parser: "json" }),
  "utf8",
);

// A reproducible audit table for the current normalized catalog. It is an audit
// artifact only; admission still occurs in generate-data.mjs.
const wikiPath = resolve(root, "src/data/source/wiki-normalized.json");
try {
  const wiki = JSON.parse(await readFile(wikiPath, "utf8"));
  const byEnglish = new Map();
  for (const record of records) {
    const key = normalizeText(record.english);
    const existing = byEnglish.get(key) ?? [];
    existing.push(record);
    byEnglish.set(key, existing);
  }
  const modelToken = (value) =>
    String(value ?? "").match(
      /(?:[A-Z]{1,5}\/)?[A-Z]*-?\d+[A-Z0-9]*(?:[-/][A-Z0-9]+)*/iu,
    )?.[0] ?? null;
  const genericChinese = new Set([
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
  const rows = (wiki.items ?? []).map((item) => {
    const candidates = byEnglish.get(normalizeText(item.nameEn)) ?? [];
    const itemModel = normalizeText(modelToken(item.model ?? item.nameEn));
    const modelCandidates = records.filter((record) => {
      const recordModel = normalizeText(modelToken(record.english));
      const zh = String(record.simplifiedChinese ?? "");
      return (
        itemModel &&
        recordModel === itemModel &&
        !genericChinese.has(zh) &&
        normalizeText(zh) !== itemModel
      );
    });
    const candidate = candidates[0] ?? modelCandidates[0];
    return {
      id: item.id,
      english: item.nameEn,
      model: item.model ?? null,
      key: candidate?.key ?? null,
      simplifiedChinese: candidate?.simplifiedChinese ?? null,
      englishFile: candidate?.englishFile ?? null,
      englishSha256: candidate?.englishSha256 ?? null,
      simplifiedFile: candidate?.simplifiedFile ?? null,
      simplifiedSha256: candidate?.simplifiedSha256 ?? null,
      status: candidate ? "resolved" : "unresolved",
      reason: candidate
        ? null
        : "no exact canonical English value in registered resource pair",
    };
  });
  const reportPath = resolve(root, "reports/translation-resolution.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    await prettier.format(
      JSON.stringify({
        schemaVersion: "translation-resolution.v1",
        gameBuild,
        rows,
      }),
      { parser: "json" },
    ),
    "utf8",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log(
  `Official localization index: ${records.length} aligned entries, ${warbondRecords.length} schinese warbond entries from ${selectedPairs.length} registered pairs.`,
);
