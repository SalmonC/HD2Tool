import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import {
  SCOPE_CATEGORIES,
  cleanWikiText,
  normalizeKey,
  normalizeEquipmentPage,
  normalizeWarbondPage,
  parseWarbondContents,
  parseWarbondPageThresholds,
  sourceRef,
  summarizeNormalized,
} from "./wiki-normalize.mjs";

const root = resolve(import.meta.dirname, "..");
const api = "https://helldivers.wiki.gg/api.php";
const wiki = "https://helldivers.wiki.gg";
const userAgent =
  "HD2-Supply-Book-sync/0.4 (English canonical data; contact repository maintainers)";
const rawPath = resolve(root, "src/data/source/wiki-raw.json");
const outputPath = resolve(root, "src/data/source/wiki-normalized.json");
const reportPath = resolve(root, "reports/wiki-sync-report.json");
const attackTaxonomyPath = resolve(
  root,
  "src/data/source/attack-taxonomy.json",
);
const offline = process.argv.includes("--offline");
const refreshAll = process.argv.includes("--refresh-all");
const capturedAt = new Date().toISOString();
const sleep = (ms) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function formattedJson(value) {
  return format(JSON.stringify(value), { parser: "json" });
}

async function requestJson(params, attempts = 4) {
  if (offline) throw new Error("offline mode has no network access");
  const url = `${api}?${new URLSearchParams({
    ...params,
    format: "json",
    formatversion: "2",
    maxlag: "5",
  })}`;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent },
      });
      if (response.ok) {
        const body = await response.json();
        if (body.error)
          throw new Error(`Wiki API ${body.error.code}: ${body.error.info}`);
        return body;
      }
      if (![429, 500, 502, 503, 504].includes(response.status))
        throw new Error(`Wiki API ${response.status}: ${url}`);
      lastError = new Error(`Wiki API ${response.status}: retry ${attempt}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(350 * 2 ** (attempt - 1));
  }
  throw lastError;
}

async function categoryMembers(category) {
  const members = [];
  let continuation = {};
  do {
    const result = await requestJson({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmnamespace: "0",
      cmtype: "page",
      cmlimit: "max",
      ...continuation,
    });
    members.push(...(result.query?.categorymembers ?? []));
    continuation = result.continue ?? null;
  } while (continuation);
  return members;
}

function chunks(values, size = 40) {
  const output = [];
  for (let index = 0; index < values.length; index += size)
    output.push(values.slice(index, index + size));
  return output;
}

async function revisionHeads(pageIds) {
  const pages = [];
  const redirects = [];
  for (const batch of chunks(pageIds)) {
    const result = await requestJson({
      action: "query",
      prop: "revisions|info",
      pageids: batch.join("|"),
      redirects: "1",
      rvprop: "ids|timestamp",
      inprop: "url",
    });
    pages.push(...(result.query?.pages ?? []));
    redirects.push(...(result.query?.redirects ?? []));
  }
  return { pages, redirects };
}

async function fullPages(pageIds) {
  const pages = [];
  const failures = [];
  for (const batch of chunks(pageIds, 25)) {
    try {
      const result = await requestJson({
        action: "query",
        prop: "revisions|info|categories",
        pageids: batch.join("|"),
        redirects: "1",
        rvprop: "ids|timestamp|content",
        rvslots: "main",
        inprop: "url",
        cllimit: "max",
      });
      for (const page of result.query?.pages ?? []) {
        const revision = page.revisions?.[0];
        if (!revision) {
          failures.push({
            pageid: page.pageid,
            title: page.title,
            error: "missing revision",
          });
          continue;
        }
        pages.push({
          title: page.title,
          pageid: page.pageid,
          revid: revision.revid,
          timestamp: revision.timestamp,
          url: page.fullurl,
          categories: (page.categories ?? []).map((entry) =>
            entry.title.replace(/^Category:/, ""),
          ),
          wikitext: revision.slots?.main?.content ?? "",
        });
      }
    } catch (error) {
      for (const pageid of batch)
        failures.push({
          pageid,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
  return { pages, failures };
}

function fileTitleFromPage(file) {
  return String(file.title ?? "").replace(/^File:/i, "");
}

function licenseFrom(text, metadata) {
  const template = String(text).match(
    /\{\{\s*License\/([A-Za-z0-9-]+)\s*\}\}/i,
  );
  if (template) return `License/${template[1]}`;
  const shortName = cleanWikiText(metadata?.LicenseShortName?.value ?? "");
  return shortName || null;
}

function authorFrom(text, metadata) {
  const artist = cleanWikiText(metadata?.Artist?.value ?? "");
  if (artist) return artist;
  const author = String(text).match(
    /(?:author|artist|creator)\s*=\s*([^\n|]+)/i,
  )?.[1];
  return author ? cleanWikiText(author) : null;
}

async function pageImageTitles(pageIds) {
  const byPageId = new Map();
  const failures = [];
  for (const batch of chunks([...new Set(pageIds)].filter(Boolean), 20)) {
    let continuation = {};
    do {
      try {
        const result = await requestJson({
          action: "query",
          prop: "images",
          pageids: batch.join("|"),
          imlimit: "max",
          ...continuation,
        });
        for (const page of result.query?.pages ?? []) {
          const current = byPageId.get(page.pageid) ?? [];
          for (const image of page.images ?? []) {
            const title = String(image.title ?? "").replace(/^File:/i, "");
            if (title && !current.includes(title)) current.push(title);
          }
          byPageId.set(page.pageid, current);
        }
        continuation = result.continue ?? null;
      } catch (error) {
        failures.push({
          pageIds: batch,
          error: error instanceof Error ? error.message : String(error),
        });
        continuation = null;
      }
    } while (continuation);
  }
  return { byPageId, failures };
}

function imageCandidateScore(item, title) {
  const lower = title.toLowerCase();
  if (
    /helmet|cape|player card|banner|overview|marketing|preview video/.test(
      lower,
    )
  )
    return -1000;
  let score = 0;
  if (/\brender\b/.test(lower)) score += 120;
  if (/\b(primary|secondary|support|throwable|armor)\b/.test(lower))
    score += 35;
  if (/\bicon\b/.test(lower)) score += item.category === "stratagem" ? 80 : 30;
  if (/stratagem icon background/.test(lower)) score += 30;
  const titleKey = normalizeKey(title);
  const modelKey = normalizeKey(item.model ?? "");
  const canonicalKey = normalizeKey(item.canonicalTitle);
  if (modelKey && titleKey.includes(modelKey)) score += 160;
  if (canonicalKey && titleKey.includes(canonicalKey)) score += 140;
  for (const token of canonicalKey
    .split("-")
    .filter((candidate) => candidate.length >= 3))
    if (titleKey.includes(token)) score += 4;
  return score;
}

function rankedPageImages(item, titles) {
  return (
    [...new Set(titles)]
      .map((title) => ({ title, score: imageCandidateScore(item, title) }))
      // Generic stat icons (for example Armor AP4) are commonly embedded on an
      // equipment page but are not depictions of that equipment. A fallback must
      // therefore either be a render or have a strong name/category match.
      .filter((entry) => entry.score >= 100)
      .sort(
        (left, right) =>
          right.score - left.score || left.title.localeCompare(right.title),
      )
      .slice(0, 6)
      .map((entry) => entry.title)
  );
}

function rightsStatusFromLicense(license) {
  const value = String(license ?? "").trim();
  if (!value || /^License\/$/i.test(value)) return "pending";
  if (/creative\s*commons|^License\/CC-/i.test(value)) return "open-license";
  return "documented-copyrighted";
}

function enrichFileRecord(record) {
  const rightsStatus =
    record.rightsStatus ?? rightsStatusFromLicense(record.license);
  const provenanceStatus =
    record.provenanceStatus ??
    (record.filePage &&
    record.originalUrl &&
    record.revision &&
    (record.sha256 || record.sha1)
      ? "verified"
      : "pending");
  return {
    ...record,
    licenseRaw: record.license ?? null,
    rightsStatus,
    provenanceStatus,
    licenseStatus:
      provenanceStatus === "verified" && rightsStatus !== "pending"
        ? "documented"
        : "pending",
  };
}

async function fileMetadata(fileTitles) {
  const records = [];
  const failures = [];
  for (const batch of chunks([...new Set(fileTitles)].filter(Boolean), 25)) {
    try {
      const result = await requestJson({
        action: "query",
        prop: "imageinfo|revisions|info",
        titles: batch.map((title) => `File:${title}`).join("|"),
        redirects: "1",
        iiprop: "url|size|mime|sha1|extmetadata",
        iiurlwidth: "480",
        rvprop: "ids|timestamp|content",
        rvslots: "main",
        inprop: "url",
      });
      for (const file of result.query?.pages ?? []) {
        const info = file.imageinfo?.[0];
        if (file.missing || !info) continue;
        const revision = file.revisions?.[0];
        const text = revision?.slots?.main?.content ?? "";
        const title = fileTitleFromPage(file);
        const license = licenseFrom(text, info?.extmetadata);
        const author = authorFrom(text, info?.extmetadata);
        records.push(
          enrichFileRecord({
            fileTitle: title,
            filePage:
              file.fullurl ??
              `${wiki}/wiki/File:${encodeURIComponent(title.replaceAll(" ", "_"))}`,
            pageId: file.pageid,
            revision: revision?.revid ?? null,
            timestamp: revision?.timestamp ?? null,
            originalUrl: info?.url ?? null,
            thumbnailUrl: info?.thumburl ?? null,
            mime: info?.mime ?? null,
            width: info?.width ?? null,
            height: info?.height ?? null,
            sha1: info?.sha1 ?? null,
            author,
            license,
            sourceRefs: [
              {
                kind: "wiki",
                label: `Helldivers Wiki.gg file: ${title}`,
                url:
                  file.fullurl ??
                  `${wiki}/wiki/File:${encodeURIComponent(title.replaceAll(" ", "_"))}`,
                pageId: file.pageid,
                revision: revision?.revid ?? null,
                oldid: revision?.revid ?? undefined,
                capturedAt: revision?.timestamp ?? null,
              },
            ],
          }),
        );
      }
    } catch (error) {
      failures.push({
        titles: batch,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { records, failures };
}

const previousRaw = await readJson(rawPath, null);
let inventory;
let categoryStatus;
let redirects = [];
let pages;
let pageFailures = [];
let cacheStats = { reusedPages: 0, fetchedPages: 0, offline: false };

if (offline) {
  if (!previousRaw?.rawSnapshotComplete)
    throw new Error(
      "Offline sync requires a complete src/data/source/wiki-raw.json snapshot.",
    );
  inventory = previousRaw.inventory;
  categoryStatus = previousRaw.categoryStatus;
  redirects = previousRaw.redirects ?? [];
  pages = previousRaw.pages;
  cacheStats = { reusedPages: pages.length, fetchedPages: 0, offline: true };
} else {
  const inventoryById = new Map();
  categoryStatus = [];
  for (const category of SCOPE_CATEGORIES) {
    try {
      const members = await categoryMembers(category);
      categoryStatus.push({ category, ok: true, count: members.length });
      for (const member of members) {
        const current = inventoryById.get(member.pageid) ?? {
          pageid: member.pageid,
          title: member.title,
          seedCategories: [],
        };
        if (!current.seedCategories.includes(category))
          current.seedCategories.push(category);
        inventoryById.set(member.pageid, current);
      }
    } catch (error) {
      categoryStatus.push({
        category,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  inventory = [...inventoryById.values()].sort((a, b) => a.pageid - b.pageid);
  if (categoryStatus.some((entry) => !entry.ok)) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      await formattedJson({
        syncedAt: capturedAt,
        status: "blocked",
        categoryStatus,
      }),
      "utf8",
    );
    throw new Error(
      "Category inventory incomplete; last-known-good snapshot preserved.",
    );
  }

  const heads = await revisionHeads(inventory.map((entry) => entry.pageid));
  redirects = heads.redirects;
  const oldByPageId = new Map(
    (previousRaw?.pages ?? []).map((page) => [page.pageid, page]),
  );
  const unchanged = [];
  const changedIds = [];
  for (const head of heads.pages) {
    const revision = head.revisions?.[0];
    const cached = oldByPageId.get(head.pageid);
    if (
      !refreshAll &&
      cached &&
      cached.revid === revision?.revid &&
      cached.wikitext
    )
      unchanged.push(cached);
    else changedIds.push(head.pageid);
  }
  const changed = await fullPages(changedIds);
  pageFailures = changed.failures;
  pages = [...unchanged, ...changed.pages].sort((a, b) => a.pageid - b.pageid);
  cacheStats = {
    reusedPages: unchanged.length,
    fetchedPages: changed.pages.length,
    offline: false,
  };
}

const pageByTitle = new Map(pages.map((page) => [page.title, page]));
const coveredTitles = new Set(pages.map((page) => page.title));
for (const redirect of redirects ?? []) coveredTitles.add(redirect.from);
const missingInventory = inventory
  .filter((entry) => !coveredTitles.has(entry.title))
  .map((entry) => ({ pageid: entry.pageid, title: entry.title }));
const rawSnapshotComplete =
  categoryStatus.every((entry) => entry.ok) &&
  pageFailures.length === 0 &&
  missingInventory.length === 0;

if (!rawSnapshotComplete && !offline) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    await formattedJson({
      syncedAt: capturedAt,
      status: "blocked",
      categoryStatus,
      discoveredPages: inventory.length,
      cachedPages: pages.length,
      redirects: redirects.length,
      pageFailures,
      missingInventory,
      rawSnapshotComplete,
    }),
    "utf8",
  );
  throw new Error(
    "Raw Wiki snapshot is incomplete; last-known-good snapshot preserved.",
  );
}

const attackTaxonomy = await readJson(attackTaxonomyPath, null);
const taxonomyPage = pageByTitle.get("Template:Armor");
if (taxonomyPage)
  attackTaxonomy.sourceRefs = [sourceRef(taxonomyPage, capturedAt)];

const warbonds = pages
  .map((page) => normalizeWarbondPage(page, capturedAt))
  .filter(Boolean);
const warbondContents = pages
  .map((page) => parseWarbondContents(page, capturedAt))
  .filter((warbond) => warbond.pages.length > 0);
const warbondContentsById = new Map(
  warbondContents.map((warbond) => [warbond.warbondId, warbond]),
);
const warbondThresholds = Object.fromEntries(
  warbonds.map((warbond) => [warbond.id, warbond.pageUnlockMedals]),
);
const warbondThresholdSources = Object.fromEntries(
  warbonds.map((warbond) => [
    warbond.id,
    Object.fromEntries(
      Object.keys(warbond.pageUnlockMedals ?? {}).map((page) => [
        page,
        warbond.pageUnlockMedalsSourceRefs ?? warbond.sourceRefs ?? [],
      ]),
    ),
  ]),
);

const prelim = pages
  .map((page) =>
    normalizeEquipmentPage(page, {
      capturedAt,
      attackTaxonomy,
      warbondThresholds,
      warbondThresholdSources,
      warbondContentsById,
      imagesByTitle: {},
    }),
  )
  .filter(Boolean);
const requestedFileTitles = prelim
  .map((item) => item.imageFileTitle)
  .filter(Boolean);
const previousFiles = new Map(
  (previousRaw?.files ?? []).map((file) => [file.fileTitle, file]),
);
const previousPageImages = new Map(
  Object.entries(previousRaw?.pageImages ?? {}).map(([pageId, titles]) => [
    Number(pageId),
    titles,
  ]),
);
let files;
let fileFailures = [];
let pageImages = previousPageImages;
if (offline) {
  files = [...previousFiles.values()].map(enrichFileRecord);
} else {
  const metadata = await fileMetadata(requestedFileTitles);
  fileFailures = metadata.failures;
  files = metadata.records.map(enrichFileRecord);
  for (const title of requestedFileTitles) {
    if (
      !files.some((file) => file.fileTitle === title) &&
      previousFiles.has(title)
    )
      files.push(enrichFileRecord(previousFiles.get(title)));
  }

  const primaryFilesByKey = new Map(
    files.map((file) => [normalizeKey(file.fileTitle), file]),
  );
  const needsFallback = prelim.filter((item) => {
    const primary = primaryFilesByKey.get(normalizeKey(item.imageFileTitle));
    return (
      !primary?.originalUrl ||
      !primary?.filePage ||
      !String(primary.licenseRaw ?? primary.license ?? "").trim()
    );
  });
  const imagePages = await pageImageTitles(
    needsFallback.map((item) => item.sourceRefs?.[0]?.pageId),
  );
  pageImages = imagePages.byPageId;
  fileFailures.push(...imagePages.failures);
  const fallbackTitles = needsFallback.flatMap((item) =>
    rankedPageImages(item, pageImages.get(item.sourceRefs?.[0]?.pageId) ?? []),
  );
  const fallbackMetadata = await fileMetadata(fallbackTitles);
  fileFailures.push(...fallbackMetadata.failures);
  const knownFiles = new Set(files.map((file) => file.fileTitle));
  for (const file of fallbackMetadata.records.map(enrichFileRecord)) {
    if (!knownFiles.has(file.fileTitle)) {
      files.push(file);
      knownFiles.add(file.fileTitle);
    }
  }
}
const filesByKey = new Map(
  files.map((file) => [normalizeKey(file.fileTitle), file]),
);
const selectedImages = new Map();
const imageFallbacks = [];
for (const item of prelim) {
  const primary = filesByKey.get(normalizeKey(item.imageFileTitle));
  const candidates = rankedPageImages(
    item,
    pageImages.get(item.sourceRefs?.[0]?.pageId) ?? [],
  )
    .map((title) => filesByKey.get(normalizeKey(title)))
    .filter(Boolean);
  const selected =
    candidates.find(
      (file) =>
        file.originalUrl &&
        file.filePage &&
        String(file.licenseRaw ?? file.license ?? "").trim(),
    ) ??
    primary ??
    candidates[0] ??
    null;
  if (selected) selectedImages.set(item.id, selected);
  if (selected && selected.fileTitle !== item.imageFileTitle) {
    imageFallbacks.push({
      itemId: item.id,
      primaryFileTitle: item.imageFileTitle,
      selectedFileTitle: selected.fileTitle,
      licenseRaw: selected.licenseRaw ?? selected.license ?? null,
    });
  }
}
const imagesByTitle = Object.fromEntries(
  files.map((file) => [file.fileTitle, file]),
);
const items = pages
  .map((page) =>
    normalizeEquipmentPage(page, {
      capturedAt,
      attackTaxonomy,
      warbondThresholds,
      warbondThresholdSources,
      warbondContentsById,
      imagesByTitle,
    }),
  )
  .filter(Boolean)
  .map((item) => {
    const selected = selectedImages.get(item.id);
    return selected
      ? { ...item, imageFileTitle: selected.fileTitle, image: selected }
      : item;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const cremator = items.find(
  (item) => item.canonicalTitle === "B/FLAM-80 Cremator",
);
const criticalErrors = [];
if (!cremator)
  criticalErrors.push("B/FLAM-80 Cremator was discovered but not normalized");
const expectedWarbondSources = [
  "CQC-1 One True Flag",
  "GL-52 De-Escalator",
  "AX/TX-13 Dog Breath",
  "AX/ARC-3 K-9",
  "B-100 Portable Hellbomb",
  "E/AT-12 Anti-Tank Emplacement",
  "LIFT-860 Hover Pack",
];
for (const title of expectedWarbondSources) {
  const item = items.find((entry) => entry.canonicalTitle === title);
  if (!item) criticalErrors.push(`${title} missing from normalized equipment`);
  else if (item.acquisition.kind !== "warbond")
    criticalErrors.push(
      `${title} acquisition parsed as ${item.acquisition.kind}`,
    );
}

const currencyFiles = {
  medals: "Medal.svg",
  "requisition-slips": "Requisition Slip.svg",
  "super-credits": "Super Credit.svg",
};
const currencies = Object.entries(currencyFiles).map(([type, fileTitle]) => ({
  type,
  fileTitle,
  image: imagesByTitle[fileTitle] ?? null,
}));
const summary = summarizeNormalized(items);
const unresolved = items
  .filter(
    (item) =>
      item.acquisition.kind === "other" ||
      (item.category === "weapon" && !item.attackProfile?.components?.length),
  )
  .map((item) => ({
    id: item.id,
    title: item.canonicalTitle,
    reasons: [
      ...(item.acquisition.kind === "other" ? ["acquisition"] : []),
      ...(item.category === "weapon" && !item.attackProfile?.components?.length
        ? ["attackProfile"]
        : []),
    ],
  }));

const raw = {
  version: "wiki-raw.v1",
  syncedAt: capturedAt,
  source: { api, userAgent },
  categoryStatus,
  inventory,
  redirects,
  pages,
  pageImages: Object.fromEntries(pageImages),
  files,
  fileFailures,
  cacheStats,
  rawSnapshotComplete,
};
const normalized = {
  version: "wiki-normalized.v2",
  syncedAt: capturedAt,
  source: {
    kind: "wiki",
    label: "Helldivers Wiki.gg MediaWiki API",
    url: api,
    userAgent,
  },
  categoryRules: {
    seeds: SCOPE_CATEGORIES,
    namespace: 0,
    admission:
      "Recognized equipment/warbond infobox plus stable category/slot rules; indexes, helmets, cosmetics and pages without a recognized infobox are excluded.",
    redirects:
      "MediaWiki redirects resolve to the canonical page; canonical page title forms the stable English ID.",
  },
  discoveredPages: inventory,
  pages: pages.map(({ wikitext, ...page }) => page),
  warbonds,
  warbondPages: warbonds,
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
  files,
  currencies,
  categoryStatus,
  coverage: {
    wikiDiscovered: inventory.length,
    rawPages: pages.length,
    rawSnapshotComplete,
    ...summary,
    unresolved,
    criticalErrors,
    imageFallbacks,
  },
};
const report = {
  syncedAt: capturedAt,
  status:
    rawSnapshotComplete &&
    criticalErrors.length === 0 &&
    fileFailures.length === 0
      ? "complete-english-layer"
      : "blocked",
  categoryStatus,
  discoveredPages: inventory.length,
  rawPages: pages.length,
  redirects: redirects.length,
  rawSnapshotComplete,
  cacheStats,
  normalized: summary,
  warbonds: warbonds.length,
  unresolved,
  criticalErrors,
  imageFallbacks,
  fileFailures,
  notes: [
    "The English layer is category-driven and does not read the community alias database.",
    "Missing facts remain null/other and are reported; no Chinese names or guessed values are generated.",
  ],
};

await mkdir(dirname(rawPath), { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
for (const [path, value] of [
  [rawPath, raw],
  [outputPath, normalized],
  [reportPath, report],
]) {
  const staging = `${path}.staging`;
  await writeFile(staging, await formattedJson(value), "utf8");
  await rename(staging, path);
}

console.log(JSON.stringify(report, null, 2));
if (report.status === "blocked") process.exitCode = 1;
