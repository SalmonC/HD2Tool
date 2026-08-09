const WIKI_ORIGIN = "https://helldivers.wiki.gg";

export const SCOPE_CATEGORIES = [
  "Weapons",
  "Armor",
  "Stratagems",
  "Throwables",
  "Boosters",
  "Warbonds",
];

export function cleanWikiText(value = "") {
  return String(value)
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[(?:File:)?([^\]|]+)\|([^\]]+)\]\]/gi, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{\s*Tooltip\s*\|\s*([^|}]+)[^}]*\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/[\s*]+/g, " ")
    .trim();
}

export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stableEquipmentId(title) {
  return normalizeKey(title);
}

export function extractTemplate(text, namePattern) {
  const start = text.search(
    new RegExp(`\\{\\{\\s*${namePattern}(?:\\s|\\n|\\|)`, "i"),
  );
  if (start < 0) return "";
  let depth = 0;
  for (let index = start; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
    } else if (pair === "}}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 2);
      index += 1;
    }
  }
  return "";
}

export function splitTopLevel(template) {
  const body = template.replace(/^\{\{[^|]+\|?/, "").replace(/\}\}$/, "");
  const parts = [];
  let current = "";
  let templateDepth = 0;
  let linkDepth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      index += 1;
    } else if (pair === "}}") {
      templateDepth -= 1;
      current += pair;
      index += 1;
    } else if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
    } else if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
    } else if (body[index] === "|" && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += body[index];
    }
  }
  parts.push(current);
  return parts;
}

export function infoboxFields(text) {
  const match = text.match(
    /\{\{\s*(Infobox[_\s]+([^|\n}]+)|Weapon)(?=\s*(?:\||\n|$))/i,
  );
  if (!match) return { name: null, fields: {} };
  const templateName = match[1].trim();
  const name = match[2]?.trim() ?? "Weapon";
  const templatePattern = templateName.toLowerCase().startsWith("infobox")
    ? `Infobox[_\\s]+${escapeRegex(name)}`
    : "Weapon";
  const template = extractTemplate(text, templatePattern);
  const fields = {};
  for (const part of splitTopLevel(template)) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim().toLocaleLowerCase("en-US");
    fields[key] = part.slice(separator + 1).trim();
  }
  return { name, fields };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function numberFrom(value) {
  const match = String(value ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function currencyAmount(value, names) {
  for (const name of names) {
    const match = String(value ?? "").match(
      new RegExp(
        `Currency\\s*\\|\\s*${escapeRegex(name)}\\s*\\|\\s*([\\d,]+)`,
        "i",
      ),
    );
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

export function sourceRef(page, capturedAt) {
  return {
    kind: "wiki",
    label: `Helldivers Wiki.gg: ${page.title}`,
    url:
      page.url ??
      `${WIKI_ORIGIN}/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    pageId: page.pageid,
    revision: page.revid,
    oldid: page.revid,
    capturedAt,
    retrievedAt: capturedAt,
  };
}

function categorySet(page) {
  return new Set((page.categories ?? []).map((value) => value.toLowerCase()));
}

function hasCategory(page, pattern) {
  return [...categorySet(page)].some((category) => pattern.test(category));
}

/** Returns null for indexes, helmets, cosmetics, enemy weapons, and other out-of-scope pages. */
export function classifyPage(page) {
  const { name, fields } = infoboxFields(page.wikitext ?? "");
  const categories = categorySet(page);
  const title = page.title.toLowerCase();
  if (
    [...categories].some((category) =>
      /^(april fools|disambiguations|helldivers 1\b|main objectives|optional objectives|objective stratagems|missions)$/.test(
        category,
      ),
    )
  )
    return null;
  if (categories.has("boosters")) {
    if (title === "boosters") return null;
    return {
      recordType: "equipment",
      category: "booster",
      slot: "booster",
      fields,
      infobox: name,
    };
  }
  if (!name) return null;
  const infobox = name.toLowerCase();

  if (categories.has("warbonds") && infobox.includes("warbond")) {
    return {
      recordType: "warbond",
      category: null,
      slot: null,
      fields,
      infobox: name,
    };
  }
  if (infobox.includes("booster")) {
    return {
      recordType: "equipment",
      category: "booster",
      slot: "booster",
      fields,
      infobox: name,
    };
  }
  if (infobox.includes("armor")) {
    if (
      title.includes("helmet") ||
      (!hasCategory(page, /(light|medium|heavy|body) armor/) &&
        fields.armor_rating === undefined &&
        fields.armor === undefined &&
        fields.passive === undefined &&
        fields.armor_passive === undefined)
    )
      return null;
    return {
      recordType: "equipment",
      category: "armor",
      slot: "armor",
      fields,
      infobox: name,
    };
  }
  // Stratagem fields are authoritative even when a nested weapon block or an
  // Infobox Support Weapon is present (notably EXO-51/EXO-55 and C4 Pack).
  // The player selects these from the stratagem permit, so do not classify
  // them from weapon_category alone.
  if (
    fields.stratagem_type !== undefined ||
    fields.stratagem_image !== undefined ||
    fields.stratagem_code !== undefined ||
    categories.has("stratagems")
  ) {
    return {
      recordType: "equipment",
      category: "stratagem",
      slot: "stratagem",
      fields,
      infobox: name,
    };
  }
  const categoryText = [...categories].join(" ");
  const fieldText =
    `${fields.weapon_category ?? ""} ${fields.stratagem_type ?? ""}`.toLowerCase();
  if (infobox.includes("stratagem")) {
    return {
      recordType: "equipment",
      category: "stratagem",
      slot: "stratagem",
      fields,
      infobox: name,
    };
  }
  if (
    infobox.includes("throwable") ||
    /throwables?|grenades?/.test(categoryText) ||
    /throwable|grenade/.test(fieldText)
  ) {
    return {
      recordType: "equipment",
      category: "grenade",
      slot: "throwable",
      fields,
      infobox: name,
    };
  }
  const isSupportWeapon =
    infobox.includes("support weapon") ||
    /support weapons?/.test(categoryText) ||
    /support weapon/.test(fieldText);
  const isWeapon =
    isSupportWeapon ||
    infobox.includes("weapon") ||
    categories.has("weapons") ||
    /primary|secondary|weapon/.test(fieldText);
  if (isWeapon) {
    const slot = isSupportWeapon
      ? "support"
      : /secondary/.test(`${categoryText} ${fieldText}`)
        ? "secondary"
        : /primary/.test(`${categoryText} ${fieldText}`)
          ? "primary"
          : undefined;
    if (!slot) return null;
    return {
      recordType: "equipment",
      category: "weapon",
      slot,
      fields,
      infobox: name,
    };
  }
  if (infobox.includes("stratagem") || categories.has("stratagems")) {
    return {
      recordType: "equipment",
      category: "stratagem",
      slot: "stratagem",
      fields,
      infobox: name,
    };
  }
  return null;
}

export function warbondIdFromTitle(value) {
  return normalizeKey(
    String(value ?? "")
      .replace(/#Page[_ ]*\d+.*/i, "")
      .replace(/Premium[_\s]+Warbond/i, "")
      .replace(/Warbond/i, ""),
  );
}

export function parseWarbondPageThresholds(page) {
  const thresholds = {};
  for (const match of page.wikitext.matchAll(
    /===+\s*Page\s*(\d+)\s*===+([\s\S]*?)(?====+\s*Page\s*\d+\s*===+|$)/gi,
  )) {
    const pageNumber = Number(match[1]);
    const pageTemplate = extractTemplate(match[2], "Acquisitions[_\\s]+Page");
    const fields = Object.fromEntries(
      splitTopLevel(pageTemplate)
        .map((part) => {
          const separator = part.indexOf("=");
          return separator < 0
            ? null
            : [
                part.slice(0, separator).trim().toLowerCase(),
                part.slice(separator + 1).trim(),
              ];
        })
        .filter(Boolean),
    );
    thresholds[pageNumber] =
      pageNumber === 1 ? 0 : numberFrom(fields.spent_to_unlock);
  }
  const infobox = infoboxFields(page.wikitext ?? "").fields;
  const allPagesMedals = currencyAmount(
    infobox["all-pages"] ?? infobox.all_pages,
    ["Medals", "Medal"],
  );
  const pageNumbers = Object.keys(thresholds)
    .map(Number)
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
  const lastPage = pageNumbers.at(-1);
  if (lastPage && thresholds[lastPage] === null && allPagesMedals !== null)
    thresholds[lastPage] = allPagesMedals;
  return thresholds;
}

function templateFields(template) {
  return Object.fromEntries(
    splitTopLevel(template)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator < 0
          ? null
          : [
              part.slice(0, separator).trim().toLowerCase(),
              part.slice(separator + 1).trim(),
            ];
      })
      .filter(Boolean),
  );
}

function canonicalLinkedTitle(value) {
  return cleanWikiText(String(value ?? "").split("#", 1)[0]).replace(/_/g, " ");
}

function tableEntries(section) {
  const entries = [];
  for (const row of section.split(/\n\|-\s*/).slice(1)) {
    const links = [...row.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)].map(
      (match) => ({
        target: canonicalLinkedTitle(match[1]),
        label: cleanWikiText(match[2] ?? match[1]),
      }),
    );
    const nonMediaLinks = links.filter(
      ({ target }) => !/^(?:File|Category):/i.test(target),
    );
    const itemLink = nonMediaLinks.find(
      ({ target }) =>
        target &&
        !/^(?:Weapons|Armor|Stratagems|Currency|Cosmetics|Title|Medals)$/i.test(
          target,
        ),
    );
    const typeCandidates = nonMediaLinks.filter(
      ({ target }) =>
        target !== itemLink?.target &&
        /(?:weapon|armor|helmet|throwable|grenade|vehicle|backpack|booster|sentry|pistol|rifle|shotgun)/i.test(
          target,
        ),
    );
    const typeLink = typeCandidates.length === 1 ? typeCandidates[0] : null;
    const itemTitle = itemLink?.target;
    const cost = numberFrom(
      row.match(/\{\{\s*Currency\s*\|\s*Medals\s*\|\s*([\d,]+)/i)?.[1],
    );
    if (itemTitle && /Currency\s*\|\s*Medals/i.test(row)) {
      entries.push({
        canonicalTitle: itemTitle,
        type: typeLink?.label ?? "",
        typeAmbiguous: typeCandidates.length > 1,
        itemMedals: cost,
        source: "contents-table",
      });
    }
  }
  return entries;
}

/**
 * Extracts the structured Contents/Acquisitions Page index from a warbond.
 * The index is deliberately kept separate from equipment-page infobox data:
 * warbond pages are the authority for page, item price, and item identity.
 */
export function parseWarbondContents(page, capturedAt) {
  const pages = [];
  const headingPattern = /===+\s*Page\s*(\d+)\s*===+/gi;
  const headings = [...String(page.wikitext ?? "").matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const pageNumber = Number(headings[index][1]);
    const start = headings[index].index + headings[index][0].length;
    const end =
      headings[index + 1]?.index ?? String(page.wikitext ?? "").length;
    const section = String(page.wikitext ?? "").slice(start, end);
    const acquisitions = extractTemplate(section, "Acquisitions[_\\s]+Page");
    const fields = acquisitions ? templateFields(acquisitions) : {};
    const templateEntries = Object.entries(fields)
      .filter(([key, value]) => /^\d+_link$/i.test(key) && value.trim())
      .map(([key, value]) => {
        const number = key.split("_", 1)[0];
        return {
          canonicalTitle: canonicalLinkedTitle(value),
          itemMedals: numberFrom(fields[`${number}_cost`]),
          name: cleanWikiText(fields[`${number}_name`] ?? ""),
          type: "",
          source: "acquisitions-page",
        };
      })
      .filter((entry) => entry.canonicalTitle);
    const tableByTitle = new Map();
    for (const entry of tableEntries(section)) {
      const key = normalizeKey(entry.canonicalTitle);
      const values = tableByTitle.get(key) ?? [];
      values.push(entry);
      tableByTitle.set(key, values);
    }
    const parsedTableEntries = tableEntries(section);
    const entries = templateEntries.length
      ? templateEntries.map((entry) => {
          const tableMatches = tableByTitle.get(
            normalizeKey(entry.canonicalTitle),
          );
          const bodyArmorMatch = tableMatches?.find(
            (candidate) =>
              /armor/i.test(candidate.type) && !/helmet/i.test(candidate.type),
          );
          const tableMatch =
            bodyArmorMatch ??
            tableMatches?.find(
              (candidate) =>
                candidate.itemMedals === entry.itemMedals ||
                candidate.itemMedals === null ||
                entry.itemMedals === null,
            ) ??
            tableMatches?.[0];
          return {
            ...entry,
            ...(tableMatch &&
            (entry.itemMedals === null ||
              (!entry.type && tableMatch.itemMedals !== entry.itemMedals))
              ? { itemMedals: tableMatch.itemMedals }
              : {}),
            ...(tableMatch?.type ? { type: tableMatch.type } : {}),
          };
        })
      : parsedTableEntries;
    if (!entries.length) continue;
    pages.push({
      page: pageNumber,
      spentToUnlock: numberFrom(fields.spent_to_unlock),
      entries,
      ambiguityCount: entries.filter((entry) => entry.typeAmbiguous).length,
      sourceRefs: [sourceRef(page, capturedAt)],
    });
  }
  return {
    warbondId: warbondIdFromTitle(page.title),
    canonicalTitle: page.title,
    sourceRefs: [sourceRef(page, capturedAt)],
    pages,
  };
}

function contentCategoryMatches(type, category) {
  const value = String(type ?? "").toLowerCase();
  if (!value) return true;
  if (category === "armor") return /armor/.test(value) && !/helmet/.test(value);
  if (category === "grenade") return /throwable|grenade/.test(value);
  if (category === "weapon")
    return /weapon|launcher|pistol|rifle|shotgun/.test(value);
  if (category === "stratagem")
    return /stratagem|vehicle|backpack|sentry|mortar|support/.test(value);
  if (category === "booster") return /booster/.test(value);
  return false;
}

/** Selects a warbond Contents record for one normalized equipment page. */
export function selectWarbondContentsEntry(item, contentsByWarbondId) {
  const titleKey = normalizeKey(item?.canonicalTitle);
  if (!titleKey) return null;
  const candidates = [];
  for (const warbond of contentsByWarbondId?.values?.() ?? []) {
    for (const page of warbond.pages ?? []) {
      for (const entry of page.entries ?? []) {
        if (normalizeKey(entry.canonicalTitle) !== titleKey) continue;
        if (entry.typeAmbiguous) continue;
        if (!contentCategoryMatches(entry.type, item.category)) continue;
        candidates.push({
          ...entry,
          warbondId: warbond.warbondId,
          page: page.page,
          sourceRefs: [
            ...(warbond.sourceRefs ?? []),
            ...(page.sourceRefs ?? []),
          ],
        });
      }
    }
  }
  if (!candidates.length) return null;
  const preferredBond = item?.acquisition?.warbondId;
  if (preferredBond) {
    const preferred = candidates.filter(
      (entry) => entry.warbondId === preferredBond,
    );
    if (preferred.length === 1) return preferred[0];
    if (preferred.length > 1) return null;
  }
  const bonds = new Set(candidates.map((entry) => entry.warbondId));
  return bonds.size === 1 && candidates.length === 1 ? candidates[0] : null;
}

function linkedSource(rawSource) {
  const match = String(rawSource ?? "").match(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/,
  );
  return match ? { target: match[1], label: match[2] ?? match[1] } : null;
}

export function parseAcquisition(
  page,
  fields,
  warbondThresholds,
  capturedAt,
  warbondThresholdSources = {},
) {
  const ref = sourceRef(page, capturedAt);
  const rawSource = String(fields.source ?? "");
  const readableSource = cleanWikiText(rawSource);
  const sourceLower = readableSource.toLowerCase();
  const linked = linkedSource(rawSource);
  const medalCost = currencyAmount(fields.unlock_cost ?? fields.cost, [
    "Medals",
    "Medal",
  ]);
  const reqCost = currencyAmount(fields.unlock_cost ?? fields.cost, [
    "Requisition",
    "Requisition Slips",
    "Requisition Slip",
  ]);
  const superCredits = currencyAmount(fields.unlock_cost ?? fields.cost, [
    "Super Credits",
    "Super Credit",
    "SC",
  ]);
  const pageNumber = numberFrom(
    rawSource.match(/#Page[_ ]*(\d+)/i)?.[1] ??
      readableSource.match(/\bP(?:age)?\s*(\d+)\b/i)?.[1],
  );
  const warbondTarget = linked?.target.match(/([^#]+Warbond)(?:#.*)?$/i)?.[1];
  if (warbondTarget || /\bwarbond\b/i.test(rawSource)) {
    const warbondId = warbondIdFromTitle(
      warbondTarget ?? linked?.label ?? readableSource,
    );
    return {
      kind: "warbond",
      warbondId,
      page: pageNumber,
      itemMedals: medalCost,
      pageUnlockMedals:
        pageNumber === 1
          ? 0
          : pageNumber
            ? (warbondThresholds[warbondId]?.[pageNumber] ?? null)
            : null,
      sourceRefs: [
        ref,
        ...(warbondThresholdSources[warbondId]?.[pageNumber] ?? []),
      ],
    };
  }
  if (
    /^\s*free\s*$/i.test(String(fields.unlock_cost ?? fields.cost ?? "")) ||
    /starter equipment|default equipment|default unlock|available by default/.test(
      sourceLower,
    )
  )
    return { kind: "default", sourceRefs: [ref] };
  if (/super ?store/.test(sourceLower) || superCredits !== null) {
    return {
      kind: "superstore",
      superCredits,
      status: "rotation",
      sourceRefs: [ref],
    };
  }
  if (reqCost !== null) {
    return {
      kind: "requisition",
      levelRequired: numberFrom(fields.unlock_level),
      requisitionPoints: reqCost,
      sourceRefs: [ref],
    };
  }
  if (/\bedition\b/.test(sourceLower)) {
    return {
      kind: "edition",
      editionName: readableSource,
      price: numberFrom(fields.cost),
      currencyCode: /USD/i.test(String(fields.cost ?? "")) ? "USD" : null,
      status: "available",
      sourceRefs: [ref],
    };
  }
  if (/liberty day|event|major order|reward/.test(sourceLower)) {
    return {
      kind: "event",
      eventName: readableSource,
      status: "available",
      sourceRefs: [ref],
    };
  }
  if (/requisition/.test(sourceLower)) {
    return {
      kind: "requisition",
      levelRequired: numberFrom(fields.unlock_level),
      requisitionPoints: null,
      sourceRefs: [ref],
    };
  }
  return {
    kind: "other",
    label: readableSource || "Wiki page does not specify acquisition",
    status: "pending",
    sourceRefs: [ref],
  };
}

function damageEntries(raw) {
  return [
    ...String(raw ?? "").matchAll(
      /\{\{\s*Damage\s*\|\s*([^|}]+)\|\s*([^|}]+)(?:\|[^}]*)?\}\}/gi,
    ),
  ].map((match) => ({
    label: cleanWikiText(match[1]) || "Attack",
    rawValue: cleanWikiText(match[2]),
    value: numberFrom(match[2]),
    dps: /\bDPS\b/i.test(match[2]),
  }));
}

function componentType(label, rawValue) {
  const value = `${label} ${rawValue}`.toLowerCase();
  if (value.includes("shrapnel")) return "shrapnel";
  if (value.includes("explosion")) return "explosion";
  if (value.includes("spray")) return "spray";
  if (value.includes("melee")) return "melee";
  if (value.includes("charge")) return "charge";
  if (/fire|flame|gas|acid|arc dot|bleed/.test(value)) return "status";
  return "projectile";
}

function armorEntries(raw, attackTaxonomy, ref) {
  return [
    ...String(raw ?? "").matchAll(
      /\{\{\s*Armor\s*\|\s*(\d+)\s*(?:\|\s*([^|}]+))?(?:\|[^}]*)?\}\}\s*(?:\(([^)]+)\))?/gi,
    ),
  ].map((match) => ({
    value: Number(match[1]),
    scale: cleanWikiText(match[2]) || "AP",
    componentLabel: cleanWikiText(match[3] ?? ""),
    option: attackTaxonomy.options.find(
      (option) => option.value === Number(match[1]),
    ),
    sourceRefs: [ref, ...(attackTaxonomy.sourceRefs ?? [])],
  }));
}

function typeToken(value) {
  return componentType(value, value);
}

function bindEntry(entries, component, index) {
  const labeled = entries.find(
    (entry) =>
      entry.componentLabel &&
      typeToken(entry.componentLabel) === component.componentType,
  );
  return (
    labeled ??
    (entries.length === 1 && index === 0 ? entries[0] : entries[index])
  );
}

export function parseAttackProfile(page, fields, attackTaxonomy, capturedAt) {
  const ref = sourceRef(page, capturedAt);
  const explicitDamage = numberFrom(fields.damage);
  const damages = damageEntries(fields.damage);
  // Some non-damaging throwables (for example a stun grenade) expose an
  // explicit numeric zero rather than a Damage template. Preserve that
  // source field as a component so AP/N-A admission can be decided from the
  // page instead of treating the item as if it had no attack data.
  if (!damages.length && explicitDamage !== null)
    damages.push({
      label: "Direct",
      rawValue: String(fields.damage),
      value: explicitDamage,
      dps: false,
    });
  if (!damages.length) return null;
  const durable = damageEntries(fields.damage_durable ?? fields.durable_damage);
  const armor = armorEntries(fields.penetration, attackTaxonomy, ref);
  const demolition = numberFrom(
    fields.demolition_force ?? fields.demolition ?? fields.demolition_power,
  );
  const stagger = numberFrom(fields.stagger_force ?? fields.stagger);
  const push = numberFrom(fields.push_force ?? fields.push);
  const components = damages.map((damage, index) => {
    const type = componentType(damage.label, damage.rawValue);
    const component = { componentType: type };
    const armorEntry =
      type === "status" && damages.length > 1
        ? null
        : bindEntry(armor, component, index);
    const durableEntry = bindEntry(durable, component, index);
    const isPrimary = index === 0;
    const isDemolitionComponent =
      type === "explosion" ||
      (isPrimary &&
        !damages.some(
          (entry) => componentType(entry.label, entry.rawValue) === "explosion",
        ));
    return {
      id: `${page.pageid}-component-${index + 1}`,
      componentType: type,
      label: damage.label,
      rawFields: {
        damage: fields.damage ?? null,
        damage_durable: fields.damage_durable ?? fields.durable_damage ?? null,
        penetration: fields.penetration ?? null,
        demolition_force:
          fields.demolition_force ??
          fields.demolition ??
          fields.demolition_power ??
          null,
      },
      fields: {
        ...(damage.value === null
          ? {}
          : damage.dps
            ? { dps: damage.value }
            : { standardDamage: damage.value }),
        ...(durableEntry?.value !== null && durableEntry?.value !== undefined
          ? { durableDamage: durableEntry.value }
          : {}),
        ...(armorEntry
          ? {
              armorPenetration: {
                label: `AP ${armorEntry.value}`,
                ...(armorEntry.option
                  ? { labelZh: armorEntry.option.labelZh }
                  : {}),
                value: armorEntry.value,
                scale: armorEntry.scale,
                taxonomySource: attackTaxonomy.taxonomySource,
                scaleVersion: attackTaxonomy.scaleVersion,
                sourceRefs: armorEntry.sourceRefs,
              },
            }
          : {}),
        ...(isDemolitionComponent &&
        Number.isInteger(demolition) &&
        demolition >= 0 &&
        demolition <= 60
          ? { demolitionForce: demolition }
          : {}),
        ...(isPrimary && stagger !== null ? { stagger } : {}),
        ...(isPrimary && push !== null ? { push } : {}),
      },
      sourceRefs: [ref],
      verificationStatus: "verified",
    };
  });
  return {
    version: "wiki-attack-profile.v2",
    sourceRefs: [ref],
    verificationStatus: "verified",
    components,
    primaryComponentId: components[0].id,
    representativeRule:
      "Primary is the first explicit infobox attack component; labeled projectile, shrapnel, explosion and status values remain separate.",
  };
}

export function parseHandlingStats(page, fields, capturedAt) {
  const ref = sourceRef(page, capturedAt);
  const numberField = (...names) => {
    for (const name of names) {
      const parsed = numberFrom(fields[name]);
      if (parsed !== null) return parsed;
    }
    return null;
  };
  const result = {
    sourceRefs: [ref],
    verificationStatus: "verified",
  };
  const mappings = [
    ["magazine", ["capacity", "magazine_capacity"]],
    ["spareMagazines", ["spare_mags", "spare_magazines"]],
    ["fireRate", ["fire_rate"]],
    ["reloadSeconds", ["reload", "reload_time"]],
    ["recoil", ["recoil"]],
  ];
  for (const [output, inputs] of mappings) {
    const value = numberField(...inputs);
    if (value !== null) result[output] = value;
  }
  if (fields.firing_modes) {
    result.firingModes = String(fields.firing_modes)
      .split(/\s*\{\{\*\}\}\s*|\s*<br\s*\/?>\s*/i)
      .map(cleanWikiText)
      .filter(Boolean);
  }
  return result;
}

export function extractImageFileTitle(fields, pageTitle = "") {
  for (const key of [
    "weapon_image",
    "armor_image",
    "stratagem_image",
    "booster_image",
    "throwable_image",
    "image",
    "icon",
  ]) {
    const raw = String(fields[key] ?? "").replace(
      /\{\{\s*PAGENAME\s*\}\}/gi,
      pageTitle,
    );
    if (!raw) continue;
    const linked = String(raw).match(
      /\[\[(?:File:)?([^\]|]+)(?:\|[^\]]*)?\]\]/i,
    )?.[1];
    const value = (linked ?? cleanWikiText(raw)).replace(/^File:/i, "").trim();
    if (/\.(?:png|jpe?g|webp|svg)$/i.test(value)) return value;
  }
  return null;
}

function secondaryInfoboxFields(page) {
  const firstMatch = page.wikitext.match(/\{\{\s*Infobox[_\s]+([^|\n}]+)/i);
  if (!firstMatch) return {};
  const first = extractTemplate(
    page.wikitext,
    `Infobox[_\\s]+${escapeRegex(firstMatch[1].trim())}`,
  );
  if (!first) return {};
  return infoboxFields(
    page.wikitext.slice(page.wikitext.indexOf(first) + first.length),
  ).fields;
}

function explicitScalarAssignment(text, key) {
  const raw = text.match(
    new RegExp(`\\|\\s*${escapeRegex(key)}\\s*=\\s*([^\\n]+)`, "i"),
  )?.[1];
  if (!raw) return undefined;
  const withoutRef = raw.replace(/<ref[\s\S]*?<\/ref>/gi, "").trim();
  return /^\d+$/.test(withoutRef) ? withoutRef : undefined;
}

function proseBoosterFields(page, fields) {
  if (Object.keys(fields).length) return fields;
  const procurement = page.wikitext.match(
    /(?:unlocked|obtained)[^\n.]*?on the\s+(\d+)(?:st|nd|rd|th)\s+page of the\s+(\[\[[^\]]+Warbond[^\]]*\]\])[^\n.]*?(\{\{Currency\|Medals\|[\d,]+[^}]*\}\})/i,
  );
  return {
    ...(procurement
      ? {
          source: `${procurement[2]} <small>{{Tooltip|P${procurement[1]}|Page ${procurement[1]}}}</small>`,
          cost: procurement[3],
        }
      : {}),
    image:
      page.wikitext.match(/\[\[File:([^\]|]+)(?:\|[^\]]*)?\]\]/i)?.[1] ??
      undefined,
  };
}

export function normalizeEquipmentPage(page, context) {
  const classification = classifyPage(page);
  if (!classification || classification.recordType !== "equipment") return null;
  const fields =
    classification.category === "booster"
      ? proseBoosterFields(page, classification.fields)
      : classification.fields;
  const secondary = secondaryInfoboxFields(page);
  const attackFields = {
    ...secondary,
    ...fields,
    demolition_force:
      fields.demolition_force ??
      secondary.demolition_force ??
      explicitScalarAssignment(page.wikitext, "demolition_force"),
    stagger_force:
      fields.stagger_force ??
      secondary.stagger_force ??
      explicitScalarAssignment(page.wikitext, "stagger_force"),
    push_force:
      fields.push_force ??
      secondary.push_force ??
      explicitScalarAssignment(page.wikitext, "push_force"),
  };
  const ref = sourceRef(page, context.capturedAt);
  const canonicalNameEn = cleanWikiText(page.title) || page.title;
  const infoboxNameEn = cleanWikiText(fields.title ?? fields.name ?? "");
  const model =
    cleanWikiText(fields.model ?? fields.weapon_code ?? "") ||
    page.title.match(/^([A-Za-z]+(?:\/[A-Za-z]+)?-[A-Za-z0-9.-]+)/)?.[1] ||
    null;
  const parsedAcquisition = parseAcquisition(
    page,
    fields,
    context.warbondThresholds,
    context.capturedAt,
    context.warbondThresholdSources,
  );
  const contentsEntry = selectWarbondContentsEntry(
    {
      canonicalTitle: page.title,
      category: classification.category,
      acquisition: parsedAcquisition,
    },
    context.warbondContentsById,
  );
  const acquisition = contentsEntry
    ? {
        kind: "warbond",
        warbondId: contentsEntry.warbondId,
        page: contentsEntry.page,
        itemMedals: contentsEntry.itemMedals,
        pageUnlockMedals:
          contentsEntry.page === 1
            ? 0
            : (context.warbondThresholds?.[contentsEntry.warbondId]?.[
                contentsEntry.page
              ] ?? null),
        sourceRefs: [ref, ...(contentsEntry.sourceRefs ?? [])],
      }
    : parsedAcquisition;
  return {
    id: stableEquipmentId(page.title),
    canonicalTitle: page.title,
    // The page title is the stable English identity. Some infoboxes use a
    // display nickname (for example CQC-72's "Trench Shovel"); preserve that
    // nickname as a sourced alias instead of replacing the canonical title.
    nameEn: canonicalNameEn,
    ...(infoboxNameEn &&
    normalizeKey(infoboxNameEn) !== normalizeKey(canonicalNameEn)
      ? {
          aliases: [
            {
              text: infoboxNameEn,
              kind: "other",
              sourceRefs: [ref],
              reviewStatus: "verified",
            },
          ],
        }
      : {}),
    model,
    category: classification.category,
    slot: classification.slot,
    infobox: classification.infobox,
    sourceRefs: [ref],
    rawFields: fields,
    acquisition,
    attackProfile: ["weapon", "grenade", "stratagem"].includes(
      classification.category,
    )
      ? parseAttackProfile(
          page,
          attackFields,
          context.attackTaxonomy,
          context.capturedAt,
        )
      : null,
    handlingStats: parseHandlingStats(page, attackFields, context.capturedAt),
    imageFileTitle: extractImageFileTitle(
      { ...secondary, ...fields },
      page.title,
    ),
    image:
      context.imagesByTitle?.[
        extractImageFileTitle({ ...secondary, ...fields }, page.title)
      ] ?? null,
    wikiLastUpdated:
      page.wikitext.match(/\{\{Last Updated\|([^}]+)\}\}/i)?.[1] ?? null,
    potentiallyOutdated:
      (page.categories ?? []).some((category) =>
        /Potentially Outdated/i.test(category),
      ) || /\{\{Potentially Outdated/i.test(page.wikitext),
  };
}

export function normalizeWarbondPage(page, capturedAt) {
  const classification = classifyPage(page);
  if (!classification || classification.recordType !== "warbond") return null;
  const superCredits = currencyAmount(classification.fields.cost, [
    "Super Credits",
    "Super Credit",
    "SC",
  ]);
  return {
    id: warbondIdFromTitle(page.title),
    canonicalTitle: page.title,
    nameEn:
      cleanWikiText(classification.fields.title ?? page.title) || page.title,
    superCredits,
    pageUnlockMedals: parseWarbondPageThresholds(page),
    pageUnlockMedalsSourceRefs: [sourceRef(page, capturedAt)],
    sourceRefs: [sourceRef(page, capturedAt)],
  };
}

export function summarizeNormalized(items) {
  const categories = {};
  const slots = {};
  for (const item of items) {
    categories[item.category] = (categories[item.category] ?? 0) + 1;
    slots[item.slot] = (slots[item.slot] ?? 0) + 1;
  }
  return {
    total: items.length,
    categories,
    slots,
    withAcquisition: items.filter((item) => item.acquisition?.kind !== "other")
      .length,
    withAttackProfile: items.filter(
      (item) => item.attackProfile?.components?.length,
    ).length,
    withArmorPenetration: items.filter((item) =>
      item.attackProfile?.components?.some(
        (component) => component.fields.armorPenetration?.value !== undefined,
      ),
    ).length,
    withDemolition: items.filter((item) =>
      item.attackProfile?.components?.some(
        (component) => component.fields.demolitionForce !== undefined,
      ),
    ).length,
    withImageFile: items.filter((item) => item.imageFileTitle).length,
    withDocumentedImage: items.filter(
      (item) =>
        item.image?.provenanceStatus === "verified" &&
        ["open-license", "documented-copyrighted"].includes(
          item.image?.rightsStatus,
        ) &&
        item.image?.licenseRaw &&
        item.image?.filePage &&
        item.image?.originalUrl,
    ).length,
  };
}
