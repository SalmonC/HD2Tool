/** HD2 Supply Book v3 minimal design authority; no v1/v2 data imports. */

export type ProductKind =
  | "primary-weapon"
  | "secondary-weapon"
  | "grenade"
  | "body-armor"
  | "support-weapon"
  | "other-stratagem";

export type FactId = string;
export type SourceId = string;
export type EquipmentId = string;
export type AssetId = string;
export type BuildStatus = "known" | "unknown" | "conflict" | "not-applicable";

export interface SourceLocator {
  uri: string;
  pageId?: string;
  revision?: string;
  gameBuild?: string;
  locale?: "en" | "zh-Hans" | "zh-Hant" | "und";
  jsonPath?: string;
  key?: string;
  fragment?: string;
  excerpt?: string;
}

export interface SourceSnapshot {
  sourceId: SourceId;
  kind: "wiki" | "official-localization" | "official-web" | "community" | "user" | "local-file";
  authority: "official" | "wiki" | "community" | "user";
  locator: SourceLocator;
  capturedAt: string;
  sha256: string;
  contentType: "wikitext" | "json" | "html" | "strings" | "image" | "text";
  extractor?: { id: string; version: string };
}

export interface RawFact<T = unknown> {
  factId: FactId;
  subject: string;
  fieldPath: string;
  value: T;
  unit?: string;
  sourceId: SourceId;
  locator: SourceLocator;
  extractorId: string;
  extractorVersion: string;
}

export type CandidateDisposition =
  | { status: "extracted" }
  | { status: "rejected"; reason: "wrong-scope" | "duplicate" | "invalid" | "rights-blocked" }
  | { status: "unresolved"; reason: "source-missing" | "not-published" | "parse-failed" | "identity-unresolved" | "ambiguous" | "unknown-threshold" | "rights-unresolved" };

export interface RawCandidate {
  candidateId: string;
  subjectHint: string;
  type: "identity" | "name" | "alias" | "localization" | "item-link" | "item-cost" | "page-prerequisite" | "attack-component" | "image" | "acquisition" | "classification";
  sourceId: SourceId;
  factIds: [FactId, ...FactId[]];
  disposition: CandidateDisposition;
}

export interface RawLedger {
  schemaVersion: "raw-ledger.v3";
  inputManifestHash: string;
  snapshots: SourceSnapshot[];
  facts: RawFact[];
  candidates: RawCandidate[];
}

export interface KnownFieldEvidence {
  fieldEvidenceId: string;
  fieldPath: string;
  status: "known";
  factIds: [FactId, ...FactId[]];
  resolvedValueHash: string;
}
export interface UnknownFieldEvidence {
  fieldEvidenceId: string;
  fieldPath: string;
  status: "unknown";
  reason: "source-missing" | "not-published" | "parse-failed" | "identity-unresolved" | "ambiguous" | "unknown-threshold" | "rights-unresolved";
}
export interface ConflictFieldEvidence {
  fieldEvidenceId: string;
  fieldPath: string;
  status: "conflict";
  reason: "source-disagreement" | "identity-collision";
  candidateFactIdGroups: [[FactId, ...FactId[]], [FactId, ...FactId[]], ...[FactId, ...FactId[]][]];
}
export interface NotApplicableFieldEvidence {
  fieldEvidenceId: string;
  fieldPath: string;
  status: "not-applicable";
  reason: string;
}
export type FieldEvidence = KnownFieldEvidence | UnknownFieldEvidence | ConflictFieldEvidence | NotApplicableFieldEvidence;

export interface CorrectionBase {
  correctionId: string;
  target: { entityId: string; fieldPath?: string };
  expectedBefore: unknown;
  sourceBindings: [{ sourceId: SourceId; sha256: string; revision?: string }, ...{ sourceId: SourceId; sha256: string; revision?: string }[]];
  evidenceFactIds: [FactId, ...FactId[]];
  reason: string;
  reviewer: string;
  reviewedAt: string;
  expiry?: string;
}
export type Correction =
  | (CorrectionBase & { kind: "identity-link"; after: { equipmentId: EquipmentId; externalKeys?: Record<string, string> } })
  | (CorrectionBase & { kind: "candidate-selection"; after: { candidateId: string } })
  | (CorrectionBase & { kind: "fact-supersession"; after: { replacementFactIds: FactId[]; supersededFactIds: FactId[] } })
  | (CorrectionBase & { kind: "taxonomy-map"; after: { taxonomy: string; value: string } });
export interface CorrectionsFile {
  schemaVersion: "corrections.v3";
  correctionsHash: string;
  corrections: Correction[];
}

export interface Alias {
  aliasId: string;
  text: string;
  targetIds: EquipmentId[];
  locale: "en" | "zh-Hans" | "zh-Hant" | "und";
  kind: "official" | "community" | "model" | "legacy";
  state: "accepted" | "pending" | "ambiguous" | "conflict";
  evidence: FieldEvidence;
}
export interface IdAlias {
  legacyId: string;
  equipmentId: EquipmentId;
}

export type NumericValue =
  | { kind: "scalar"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "variants"; values: { id: string; label: string; value: number }[] };

export interface AttackComponent {
  componentId: string;
  role: "direct" | "shrapnel" | "explosion" | "fire" | "melee" | "spray" | "status" | "alternate" | "other";
  label: string;
  standardDamage?: NumericValue;
  durableDamage?: NumericValue;
  armorPenetration?: NumericValue;
  demolition?: NumericValue;
}
export interface CombatProfile {
  weaponClass?: string;
  ammoTraits?: ("ballistic" | "laser" | "plasma" | "arc" | "fire" | "gas" | "other")[];
  components?: AttackComponent[];
  handling?: {
    capacity?: { value: number; kind: "rounds" | "charges" | "heat" | "uses" };
    reserveCapacity?: { value: number; kind: "rounds" | "charges" | "heat" | "uses" };
    fireRateRpm?: number;
    recoil?: number;
  };
}
export interface ArmorProfile {
  class?: "light" | "medium" | "heavy";
  rating?: number;
  speed?: number;
  staminaRegen?: number;
  passive?: { name: string; summary?: string };
}
export interface DeploymentProfile {
  kind?: "orbital" | "eagle" | "backpack" | "sentry" | "emplacement" | "minefield" | "vehicle" | "other";
  code?: string;
  callInSeconds?: number;
  cooldownSeconds?: number;
  uses?: number;
}

export type Acquisition =
  | { kind: "default" }
  | { kind: "requisition"; levelRequired?: number; requisitionSlips: number }
  | { kind: "warbond"; warbondId: string; page: number; itemMedals: number }
  | { kind: "superstore"; superCredits: number; rotation?: string }
  | { kind: "edition"; editionName: string }
  | { kind: "event"; eventName: string }
  | { kind: "poi"; location: string }
  | { kind: "grant"; label: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "unknown"; reason: "source-missing" | "not-published" | "identity-unresolved" | "conflicting" };

export interface Warbond {
  id: string;
  nameZhHans: string;
  nameEn: string;
  purchaseSuperCredits?: number;
  fieldEvidence: FieldEvidence[];
}
export interface WarbondPage {
  pageId: string;
  warbondId: string;
  page: number;
  cumulativePrerequisiteMedals: number | null;
  fieldEvidence: FieldEvidence[];
}

export interface AssetRegistryEntry {
  assetId: AssetId;
  path: string;
  sha256: string;
  sourceEvidenceId: string;
  licenseEligible: boolean;
  displayEligibility: "real" | "placeholder" | "blocked";
}

export interface Equipment {
  id: EquipmentId;
  productKind: ProductKind;
  model?: string;
  nameZhHans: string;
  nameEn: string;
  currentAcquisition: Acquisition;
  combat?: CombatProfile;
  armor?: ArmorProfile;
  deployment?: DeploymentProfile;
  imageAssetId: AssetId;
  wikiUrl: string;
  fieldEvidence: FieldEvidence[];
}
export interface ResolvedCatalog {
  schemaVersion: "resolved-catalog.v3";
  catalogVersion: string;
  resolvedCatalogHash: string;
  inputManifestHash: string;
  acquisitionAsOf: string;
  equipment: Equipment[];
  aliases: Alias[];
  idAliases: IdAlias[];
  warbonds: Warbond[];
  warbondPages: WarbondPage[];
  assets: AssetRegistryEntry[];
  correctionsHash: string;
}

export interface RuntimeEquipment {
  id: EquipmentId;
  model?: string;
  nameZhHans: string;
  nameEn: string;
  aliases: string[];
  productKind: ProductKind;
  currentAcquisition: Acquisition;
  combat?: CombatProfile;
  armor?: ArmorProfile;
  deployment?: DeploymentProfile;
  image: { assetId: AssetId; path: string; status: "real" | "placeholder" };
  wikiUrl: string;
}
export type RuntimeWarbond = Omit<Warbond, "fieldEvidence">;
export interface RuntimeProjection {
  schemaVersion: "runtime-projection.v3";
  catalogVersion: string;
  resolvedCatalogHash: string;
  inputManifestHash: string;
  acquisitionAsOf: string;
  projectionHash: string;
  ruleVersion: string;
  equipment: RuntimeEquipment[];
  warbonds: RuntimeWarbond[];
  warbondPages: Pick<WarbondPage, "pageId" | "warbondId" | "page" | "cumulativePrerequisiteMedals">[];
}

export interface PlanV3 {
  schemaVersion: "plan.v3";
  catalogVersion: string;
  catalogHash: string;
  pendingIds: EquipmentId[];
  completedIds: EquipmentId[];
  orphans: { equipmentId: EquipmentId; lastKnownName: string; reason: "removed" | "id-migration" | "invalid" }[];
  updatedAt: string;
}

export interface AuditReport {
  schemaVersion: "audit-report.v3";
  catalogVersion: string;
  inputHashes: Record<string, string>;
  schemaVersionUsed: string;
  ruleVersions: Record<string, string>;
  toolVersions: Record<string, string>;
  stageCounts: Record<string, number>;
  stageSetHashes: Record<string, string>;
  setReconciliations: { reconciliationId: string; missingIds: string[]; extraIds: string[]; expectedHash: string; actualHash: string }[];
  runtimeDiff: { matches: boolean; expectedHash: string; actualHash: string; changes: string[] };
  migrationDiff: { lossyCount: number; changes: string[] };
  mismatches: { code: string; severity: "P0" | "P1" | "P2" | "info"; entityId?: string; fieldPath?: string; expected?: unknown; actual?: unknown; factIds?: FactId[]; suggestedAction?: string }[];
  unknownByReason: Record<string, number>;
  conflicts: string[];
  staleCorrections: string[];
  unaccountedCandidates: string[];
  durationsMs: Record<string, number>;
  cacheHits: Record<string, number>;
}

export function displayGroupFor(productKind: ProductKind): "weapon" | "armor" | "stratagem" {
  return productKind === "body-armor" ? "armor" : productKind === "primary-weapon" || productKind === "secondary-weapon" || productKind === "grenade" ? "weapon" : "stratagem";
}

export function slotFor(productKind: ProductKind): "primary" | "secondary" | "throwable" | "armor" | "support" | "stratagem" {
  switch (productKind) {
    case "primary-weapon": return "primary";
    case "secondary-weapon": return "secondary";
    case "grenade": return "throwable";
    case "body-armor": return "armor";
    case "support-weapon": return "support";
    case "other-stratagem": return "stratagem";
  }
}

export function normalizeSearchInput(input: string): string {
  return input.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
}
