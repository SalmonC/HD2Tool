import manifest from "../../src/data/source/product-scope.v2.json" with { type: "json" };

export const PRODUCT_SCOPE_MANIFEST = manifest;
export const PRODUCT_GROUPS = Object.freeze(
  manifest.groups.map((rule) => rule.productGroup),
);

const dispositionRules = Object.freeze(
  manifest.exclusions.filter((rule) => rule.ruleId !== "unsupported-category"),
);
const fallbackRule = manifest.exclusions.find(
  (rule) => rule.ruleId === "unsupported-category",
);

const matches = (item, match) => {
  if (match.ids && !match.ids.includes(item.id)) return false;
  if (match.category && match.category !== item.category) return false;
  if (match.slot && match.slot !== item.slot) return false;
  if (match.categories && !match.categories.includes(item.category))
    return false;
  return true;
};

export function matchingProductScopeRules(item) {
  return [
    ...manifest.groups.filter((rule) => matches(item, rule.match)),
    ...dispositionRules.filter((rule) => matches(item, rule.match)),
  ];
}

export function productGroupForItem(item) {
  return (
    manifest.groups.find((rule) => matches(item, rule.match))?.productGroup ??
    null
  );
}

export function classifyFormalCatalogUnexpectedIds(
  formalCatalogIds,
  expectedReleasedIds,
  scopeById,
) {
  const expected = new Set(expectedReleasedIds);
  return [...new Set(formalCatalogIds)]
    .filter((id) => !expected.has(id))
    .sort()
    .map((id) => {
      const scope = scopeById?.get(id);
      const classification =
        scope?.scopeClass === "upcoming"
          ? "upcoming-leaked"
          : scope?.scopeClass === "out-of-product-scope"
            ? "out-of-scope-leaked"
            : "unknown";
      return { id, classification };
    });
}

export function catalogUnexpectedPass(unexpectedDetails) {
  return unexpectedDetails.length === 0;
}

export function classifyProductScope(item) {
  const matched = matchingProductScopeRules(item);
  const groupRule = matched.find((rule) => manifest.groups.includes(rule));
  const dispositionRule = matched.find((rule) =>
    dispositionRules.includes(rule),
  );
  const rule = dispositionRule ?? groupRule ?? fallbackRule;
  if (!rule) {
    return {
      scopeClass: "out-of-product-scope",
      productGroup: null,
      reason: "no-matching-rule",
      ruleId: null,
      matchedRuleIds: [],
      availability: "excluded",
      scopeDisposition: "excluded",
    };
  }
  const scopeClass = rule.scopeClass;
  return {
    scopeClass,
    productGroup: groupRule?.productGroup ?? null,
    reason: rule.reason ?? null,
    ruleId: rule.ruleId,
    availableFrom: rule.availableFrom ?? null,
    matchedRuleIds: matched.map((candidate) => candidate.ruleId),
    availability:
      scopeClass === "upcoming"
        ? "upcoming"
        : scopeClass === "required"
          ? "released"
          : "excluded",
    scopeDisposition:
      scopeClass === "required"
        ? "include"
        : scopeClass === "upcoming"
          ? "upcoming"
          : "excluded",
  };
}
