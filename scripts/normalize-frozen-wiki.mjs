import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import {
  SCOPE_CATEGORIES,
  normalizeEquipmentPage,
  normalizeWarbondPage,
  parseWarbondContents,
  sourceRef,
  summarizeNormalized,
} from "./wiki-normalize.mjs";

const root = resolve(import.meta.dirname, "..");
const rawPath = resolve(root, "src/data/source/wiki-raw.json");
const normalizedPath = resolve(root, "src/data/source/wiki-normalized.json");
const taxonomyPath = resolve(root, "src/data/source/attack-taxonomy.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const raw = await readJson(rawPath);
const previous = await readJson(normalizedPath);
const attackTaxonomy = await readJson(taxonomyPath);
const capturedAt = previous.syncedAt ?? new Date().toISOString();
const pages = Array.isArray(raw.pages) ? raw.pages : [];
const pageRef = (page) => sourceRef(page, capturedAt);

const warbondPages = pages
  .map((page) => normalizeWarbondPage(page, capturedAt))
  .filter(Boolean);
const warbondContents = pages
  .map((page) => parseWarbondContents(page, capturedAt))
  .filter((warbond) => warbond.pages.length > 0);
const warbondContentsById = new Map(
  warbondContents.map((warbond) => [warbond.warbondId, warbond]),
);
const warbondThresholds = Object.fromEntries(
  warbondPages.map((warbond) => [warbond.id, warbond.pageUnlockMedals]),
);
const warbondThresholdSources = Object.fromEntries(
  warbondPages.map((warbond) => [
    warbond.id,
    Object.fromEntries(
      Object.keys(warbond.pageUnlockMedals ?? {}).map((page) => [
        page,
        warbond.pageUnlockMedalsSourceRefs ?? warbond.sourceRefs ?? [],
      ]),
    ),
  ]),
);
const filesByTitle = Object.fromEntries(
  (raw.files ?? []).map((file) => [file.fileTitle, file]),
);
const items = pages
  .map((page) =>
    normalizeEquipmentPage(page, {
      capturedAt,
      attackTaxonomy,
      warbondThresholds,
      warbondThresholdSources,
      warbondContentsById,
      imagesByTitle: filesByTitle,
    }),
  )
  .filter(Boolean)
  .sort((left, right) => left.id.localeCompare(right.id));
const summary = summarizeNormalized(items);
const normalized = {
  ...previous,
  version: "wiki-normalized.v2",
  syncedAt: capturedAt,
  categoryRules: {
    ...(previous.categoryRules ?? {}),
    seeds: SCOPE_CATEGORIES,
  },
  discoveredPages: previous.discoveredPages,
  pages: pages.map(({ wikitext, ...page }) => page),
  warbonds: warbondPages,
  warbondPages,
  warbondContents,
  warbondAcquisitionIndex: warbondContents.flatMap((warbond) =>
    warbond.pages.flatMap((page) =>
      page.entries.map((entry) => ({
        ...entry,
        warbondId: warbond.warbondId,
        page: page.page,
        sourceRefs: [...(warbond.sourceRefs ?? []), ...(page.sourceRefs ?? [])],
      })),
    ),
  ),
  attackTaxonomy,
  items,
  files: raw.files ?? previous.files ?? [],
  currencies: previous.currencies ?? [],
  categoryStatus: previous.categoryStatus ?? [],
  coverage: {
    ...(previous.coverage ?? {}),
    ...summary,
    wikiDiscovered: previous.coverage?.wikiDiscovered ?? pages.length,
    rawPages: pages.length,
    rawSnapshotComplete: raw.rawSnapshotComplete === true,
    unresolved: items
      .filter((item) => item.acquisition?.kind === "other")
      .map((item) => ({
        id: item.id,
        title: item.canonicalTitle,
        reasons: ["acquisition"],
      })),
  },
};
const formatted = await format(JSON.stringify(normalized), { parser: "json" });
const stagingPath = `${normalizedPath}.staging`;
await writeFile(stagingPath, formatted, "utf8");
await rename(stagingPath, normalizedPath);

const exo55 = items.find((item) => item.id === "exo-55-breakthrough-exosuit");
if (exo55 && (exo55.category !== "stratagem" || exo55.slot !== "stratagem"))
  throw new Error("Frozen normalization classified EXO-55 incorrectly");
console.log(
  JSON.stringify(
    {
      rawPages: pages.length,
      normalizedItems: items.length,
      exo55: exo55
        ? {
            category: exo55.category,
            slot: exo55.slot,
            sourcePageId: exo55.sourceRefs?.[0]?.pageId,
          }
        : null,
    },
    null,
    2,
  ),
);
