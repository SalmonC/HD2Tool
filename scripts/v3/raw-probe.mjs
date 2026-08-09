import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
export const RAW_PATH = resolve(ROOT, "src/data/source/wiki-raw.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function cleanTitle(value) {
  return String(value ?? "")
    .replace(/^:+/u, "")
    .replace(/_/gu, " ")
    .split("#", 1)[0]
    .trim();
}

function hasPageHeading(text) {
  return (
    /===\s*Page\s*\d+\s*===/iu.test(text) || /===Page\s*\d+===/iu.test(text)
  );
}

function warbondPage(page) {
  return (
    page.categories?.includes("Warbonds") &&
    page.categories?.includes("Pages with Warbond Infobox") &&
    !page.title.includes("/zh") &&
    hasPageHeading(page.wikitext ?? "")
  );
}

function pageSections(text) {
  const headings = [
    ...String(text ?? "").matchAll(/===\s*Page\s*(\d+)\s*===/giu),
  ];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const nextPage = headings[index + 1]?.index ?? text.length;
    const nextSectionOffset = text.slice(start, nextPage).search(/\n==[^=]/u);
    const end = nextSectionOffset < 0 ? nextPage : start + nextSectionOffset;
    return { page: Number(heading[1]), text: text.slice(start, end) };
  });
}

function tableRowCount(section) {
  return section
    .split(/\n\|-\s*/u)
    .slice(1)
    .filter((row) => {
      const links = [...row.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/gu)].map(
        (match) => cleanTitle(match[1]),
      );
      const nonMedia = links.filter(
        (link) => !/^(?:File|Category):/iu.test(link),
      );
      const cells = row
        .split(/\|\|/u)
        .map((cell) => cell.replace(/^\s*\|\s*/u, "").trim());
      const plainItem = cells[1]
        ?.replace(/\[\[[^\]]+\]\]/gu, "")
        .replace(/<[^>]+>/gu, "")
        .replace(/'{2,}/gu, "")
        .trim();
      return Boolean(
        nonMedia.some(
          (link) =>
            !/^(?:Weapons|Armor|Stratagems|Currency|Cosmetics|Title|Medals)$/iu.test(
              link,
            ),
        ) ||
        plainItem ||
        /\{\{\s*Currency\s*\|/iu.test(row),
      );
    }).length;
}

export function probeRawSnapshot(raw, rawBytes) {
  const warbonds = raw.pages.filter(warbondPage);
  let nLink = 0;
  let nCost = 0;
  let tableRows = 0;
  let pageCount = 0;
  for (const page of warbonds) {
    const text = page.wikitext ?? "";
    nLink += [...text.matchAll(/\|\s*\d+_link\s*=/giu)].length;
    nCost += [...text.matchAll(/\|\s*\d+_cost\s*=/giu)].length;
    const sections = pageSections(text);
    pageCount += sections.length;
    tableRows += sections.reduce(
      (sum, section) => sum + tableRowCount(section.text),
      0,
    );
  }
  const pageRefs = raw.pages
    .map((page) => ({
      pageId: page.pageid,
      revision: page.revid,
      title: page.title,
    }))
    .sort((left, right) => left.pageId - right.pageId);
  const duplicatePageIds = pageRefs
    .filter((page, index) => pageRefs[index - 1]?.pageId === page.pageId)
    .map((page) => page.pageId);
  return {
    rawPageCount: raw.pages.length,
    rawSnapshotComplete: raw.rawSnapshotComplete === true,
    rawByteSha256: sha256(rawBytes),
    rawPageRevisionClosure: {
      count: pageRefs.length,
      duplicatePageIds,
      pageRefs,
    },
    warbondPageCount: warbonds.length,
    warbondPageIds: warbonds
      .map((page) => page.pageid)
      .sort((left, right) => left - right),
    warbondPageSectionCount: pageCount,
    acquisitionProbe: {
      nLink,
      nCost,
      tableRows,
      totalCandidates: nLink + tableRows,
    },
  };
}

export async function readAndProbeRaw() {
  const rawBytes = await readFile(RAW_PATH);
  return probeRawSnapshot(JSON.parse(rawBytes), rawBytes);
}
