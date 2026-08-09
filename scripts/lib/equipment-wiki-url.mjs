const WIKI_ORIGIN = "https://helldivers.wiki.gg";
const WIKI_PATH_PREFIX = "/wiki/";
const DISALLOWED_NAMESPACE_PREFIXES = new Set([
  "category",
  "file",
  "help",
  "mediawiki",
  "module",
  "special",
  "template",
  "user",
]);

function isDisallowedNamespace(title) {
  const namespace = title
    .match(/^([^:]+):/u)?.[1]
    ?.trim()
    .toLocaleLowerCase("en-US");
  return Boolean(
    namespace &&
    (DISALLOWED_NAMESPACE_PREFIXES.has(namespace) ||
      namespace === "talk" ||
      namespace.endsWith(" talk")),
  );
}

function titleKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[&]amp;/g, "&")
    .replace(/[\s_]+/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, "");
}

function candidateFrom(source) {
  if (source?.kind !== "wiki" || typeof source.url !== "string") return null;
  if (!/^https:\/\/helldivers\.wiki\.gg(?=\/|$)/u.test(source.url)) return null;
  if (/^https:\/\/[^/]*:\d+(?:\/|$)/u.test(source.url)) return null;

  let parsed;
  try {
    parsed = new URL(source.url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "helldivers.wiki.gg" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !parsed.pathname.startsWith(WIKI_PATH_PREFIX) ||
    parsed.pathname === WIKI_PATH_PREFIX
  )
    return null;

  let title;
  try {
    title = decodeURIComponent(
      parsed.pathname.slice(WIKI_PATH_PREFIX.length),
    ).replaceAll("_", " ");
  } catch {
    return null;
  }
  if (
    isDisallowedNamespace(title) ||
    /\bwarbond\b/iu.test(title) ||
    !Number.isInteger(source.pageId) ||
    (source.revision === undefined && source.oldid === undefined)
  )
    return null;

  const canonicalPath = `${WIKI_ORIGIN}${WIKI_PATH_PREFIX}${titleKey(title)}`;
  const rawRevision = source.revision ?? source.oldid;
  const revision = Number.isFinite(Number(rawRevision))
    ? Number(rawRevision)
    : 0;
  const cleanUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
  return { canonicalPath, cleanUrl, revision };
}

/**
 * Select one canonical equipment page from full build-time sourceRefs.
 * Duplicate URL spellings are collapsed by decoded canonical title/path;
 * different valid titles are treated as ambiguity and return null.
 */
export function selectEquipmentWikiUrl(item) {
  const canonicalKeys = [item?.canonicalTitle, item?.nameEn]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => `${WIKI_ORIGIN}${WIKI_PATH_PREFIX}${titleKey(value)}`);
  if (!canonicalKeys.length) return null;

  const candidates = new Map();
  for (const source of item?.sourceRefs ?? []) {
    const candidate = candidateFrom(source);
    if (!candidate || !canonicalKeys.includes(candidate.canonicalPath))
      continue;
    const previous = candidates.get(candidate.canonicalPath);
    if (
      !previous ||
      candidate.revision > previous.revision ||
      (candidate.revision === previous.revision &&
        candidate.cleanUrl.localeCompare(previous.cleanUrl) < 0)
    )
      candidates.set(candidate.canonicalPath, candidate);
  }
  const matches = [...candidates.values()];
  return matches.length === 1 ? matches[0].cleanUrl : null;
}
