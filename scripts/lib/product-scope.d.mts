export interface ProductScopeItem {
  id: string;
  category?: string;
  slot?: string;
}

export interface ProductScopeRule {
  ruleId: string;
  scopeClass: "required" | "upcoming" | "out-of-product-scope";
  productGroup?: string | null;
  match?: Record<string, unknown>;
  reason?: string;
  availableFrom?: string;
}

export interface ProductScopeClassification {
  scopeClass: "required" | "upcoming" | "out-of-product-scope";
  productGroup: string | null;
  reason: string | null;
  ruleId: string | null;
  matchedRuleIds: string[];
  availableFrom: string | null;
  availability: "released" | "upcoming" | "excluded";
  scopeDisposition: "include" | "upcoming" | "excluded";
}

export const PRODUCT_SCOPE_MANIFEST: {
  schemaVersion: string;
  groups: ProductScopeRule[];
  exclusions: ProductScopeRule[];
};
export const PRODUCT_GROUPS: readonly string[];

export function matchingProductScopeRules(
  item: ProductScopeItem,
): ProductScopeRule[];
export function productGroupForItem(item: ProductScopeItem): string | null;
export function classifyProductScope(
  item: ProductScopeItem,
): ProductScopeClassification;
export function classifyFormalCatalogUnexpectedIds(
  formalCatalogIds: string[],
  expectedReleasedIds: string[],
  scopeById?: Map<string, { scopeClass: string }>,
): Array<{
  id: string;
  classification: "upcoming-leaked" | "out-of-scope-leaked" | "unknown";
}>;
export function catalogUnexpectedPass(
  unexpectedDetails: Array<unknown>,
): boolean;
