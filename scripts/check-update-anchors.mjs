import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const anchors = JSON.parse(
  await readFile(resolve(root, "data/wiki-update-anchors.json"), "utf8"),
);
const imageManifest = JSON.parse(
  await readFile(resolve(root, "data/wiki-image-manifest.json"), "utf8"),
);
const api = "https://helldivers.wiki.gg/api.php";

if (
  anchors.version !== 1 ||
  anchors.image?.equipmentId !== "b-flam-80-cremator" ||
  anchors.stats?.equipmentId !== "g-40-k-melta-mine" ||
  !/^[0-9a-f]{40}$/.test(anchors.image.remoteSha1 ?? "") ||
  !["MISSING", "AVAILABLE"].includes(anchors.stats.baselineState) ||
  (anchors.stats.baselineState === "AVAILABLE" &&
    !/^[0-9a-f]{64}$/.test(anchors.stats.baselineSignature ?? ""))
)
  throw new Error("update anchor configuration is invalid");

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "HD2Tool update anchor check/0.1" },
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 300),
        );
    }
  }
  throw lastError;
}

const imageBaseline = imageManifest.entries.find(
  (entry) =>
    entry.equipmentId === anchors.image.equipmentId &&
    entry.purpose === anchors.image.purpose,
);
if (!imageBaseline)
  throw new Error("image anchor is absent from the image manifest");

const imagePageParams = new URLSearchParams({
  action: "parse",
  pageid: String(anchors.image.equipmentPageId),
  prop: "text",
  format: "json",
  formatversion: "2",
});
const imagePageHtml =
  (await fetchJson(`${api}?${imagePageParams}`)).parse?.text ?? "";
const imageReference = imagePageHtml.match(
  /File:([^"'<>]+Stratagem[^"'<>]+(?:svg|png))/i,
);
if (!imageReference)
  throw new Error(
    "image anchor page has no recognizable loadout icon reference",
  );
const currentFileTitle = `File:${imageReference[1].replaceAll("_", " ")}`;

const imageParams = new URLSearchParams({
  action: "query",
  prop: "imageinfo",
  iiprop: "sha1|timestamp",
  titles: currentFileTitle,
  redirects: "1",
  format: "json",
  formatversion: "2",
});
const imageQuery = await fetchJson(`${api}?${imageParams}`);
const imagePage = imageQuery.query?.pages?.[0];
const imageInfo = imagePage?.imageinfo?.[0];
if (!imageInfo?.sha1) throw new Error("image anchor has no current Wiki SHA-1");
const imageChanged =
  currentFileTitle !== anchors.image.fileTitle ||
  imageInfo.sha1 !== anchors.image.remoteSha1;

const statsParams = new URLSearchParams({
  action: "parse",
  pageid: String(anchors.stats.pageId),
  prop: "text|revid",
  format: "json",
  formatversion: "2",
});
const statsParse = (await fetchJson(`${api}?${statsParams}`)).parse;
const html = statsParse?.text ?? "";
const headingId = anchors.stats.section.replaceAll(" ", "_");
const headingIndex = html.indexOf(`id="${headingId}"`);
if (headingIndex < 0)
  throw new Error("stats anchor section is missing from the Wiki page");
const sectionStart = html.lastIndexOf("<h2", headingIndex);
const sectionEndCandidate = html.indexOf(
  "<h2",
  headingIndex + headingId.length,
);
const sectionEnd = sectionEndCandidate < 0 ? html.length : sectionEndCandidate;
const sectionHtml = html.slice(sectionStart, sectionEnd);
let statsState;
if (/Weapon not found/i.test(sectionHtml)) statsState = "MISSING";
else if (
  /(?:Damage|Armor Penetration|Demolition|Durable Damage|AP)/i.test(
    sectionHtml,
  ) &&
  /<(?:table|tr|td|th)\b/i.test(sectionHtml)
)
  statsState = "AVAILABLE";
else statsState = "UNKNOWN";
if (statsState === "UNKNOWN")
  throw new Error(
    "stats anchor returned an unrecognized Detailed Statistics section",
  );
const statsSignature =
  statsState === "AVAILABLE"
    ? createHash("sha256")
        .update(
          sectionHtml
            .replace(/<span class="mw-editsection">[\s\S]*?<\/span>/gi, "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .digest("hex")
    : undefined;
const statsChanged =
  statsState !== anchors.stats.baselineState ||
  (statsState === "AVAILABLE" &&
    statsSignature !== anchors.stats.baselineSignature);

console.log(
  JSON.stringify(
    {
      image: {
        equipmentId: anchors.image.equipmentId,
        baselineFileTitle: anchors.image.fileTitle,
        currentFileTitle,
        baselineSha1: anchors.image.remoteSha1,
        currentSha1: imageInfo.sha1,
        status: imageChanged ? "IMAGE_TRIGGER" : "NO_ANCHOR_CHANGE",
        nextStep: imageChanged
          ? "Run images:check, review every changed support loadout icon, then sync the full icon category."
          : undefined,
      },
      stats: {
        equipmentId: anchors.stats.equipmentId,
        pageId: anchors.stats.pageId,
        revision: statsParse?.revid,
        template: anchors.stats.template,
        argument: anchors.stats.argument,
        baselineState: anchors.stats.baselineState,
        currentState: statsState,
        baselineSignature: anchors.stats.baselineSignature,
        currentSignature: statsSignature,
        status: statsChanged ? "STATS_TRIGGER" : "NO_ANCHOR_CHANGE",
        nextStep: statsChanged
          ? "Review all newly released equipment pages and decoded modules, then fill only sourced catalog fields."
          : undefined,
      },
    },
    null,
    2,
  ),
);

if (imageChanged || statsChanged) process.exitCode = 1;
