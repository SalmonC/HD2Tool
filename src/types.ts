export type Category = "weapon" | "armor" | "stratagem" | "grenade" | "booster";

export type VerificationStatus = "verified" | "pending" | "sample";
export type AdmissionStatus = "admitted" | "candidate" | "quarantine";

export type SourceKind =
  "local-fixture" | "game-data" | "official" | "community" | "wiki" | "manual";

export interface SourceRef {
  kind: SourceKind;
  label: string;
  url?: string;
  pageId?: number;
  revision?: number | string;
  oldid?: number;
  capturedAt?: string;
  retrievedAt?: string;
}

export interface Alias {
  text: string;
  kind: "community" | "model" | "translation" | "other";
  sourceRefs: SourceRef[];
  reviewStatus: "verified" | "pending" | "rare";
}

export interface TranslationEvidence {
  canonicalEnglish: string;
  candidateZh: string;
  platform?: string;
  evidenceRefs: SourceRef[];
  hitKeywords: string[];
  searchedAt: string;
  confidence: "high" | "medium" | "low";
  status:
    | "official"
    | "verified-community"
    | "existing-user-supplied"
    | "pending"
    | "conflicting";
}

export interface AssetRecord {
  itemId?: string;
  fileTitle?: string;
  downloadUrl?: string | null;
  path: string;
  alt: string;
  status: "placeholder" | "candidate" | "verified";
  originalPage: string | null;
  filePage?: string | null;
  originalUrl?: string | null;
  author: string | null;
  syncedAt: string;
  fileHash: string | null;
  license?: string | null;
  licenseRaw?: string | null;
  licenseUrl?: string | null;
  sourceRefs: SourceRef[];
  licenseStatus: "project-created-placeholder" | "pending" | "documented";
  provenanceStatus?: "verified" | "pending";
  rightsStatus?: "open-license" | "documented-copyrighted" | "pending";
}

export type WeaponDimension =
  "weaponType" | "ammoTraits" | "armorPenetration" | "demolitionPower";
export type AmmoTrait = string;

export interface TaxonomyOption {
  id: string;
  labelZh: string;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
}

export interface TaxonomyDimension {
  id: WeaponDimension;
  labelZh: string;
  valueKind: "single" | "multi" | "number";
  taxonomySource: string;
  scaleVersion: string;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  options: TaxonomyOption[];
  numberScale?: { min: number; max: number; step: number; unit?: string };
}

export interface Taxonomy {
  version: string;
  dimensions: Partial<Record<WeaponDimension, TaxonomyDimension>>;
}

export interface VerifiedField<T> {
  value: T;
  taxonomySource: string;
  scaleVersion: string;
  sourceRefs: SourceRef[];
  verificationStatus: "verified" | "pending";
}

/** Kept for backwards-compatible imports. New data uses AttackProfile. */
export interface WeaponProfile {
  weaponType?: VerifiedField<string>;
  ammoTraits?: VerifiedField<string[]>;
  armorPenetration?: VerifiedField<number>;
  demolitionPower?: VerifiedField<number>;
}

export type AttackComponentType =
  | "projectile"
  | "shrapnel"
  | "explosion"
  | "spray"
  | "melee"
  | "charge"
  | "alternate"
  | "status"
  | "other";

export interface AttackComponentFields {
  standardDamage?: number;
  durableDamage?: number;
  dps?: number;
  armorPenetration?: {
    label: string;
    labelZh?: string;
    value?: number;
    minValue?: number;
    maxValue?: number;
    scale?: string;
    taxonomySource?: string;
    scaleVersion?: string;
    sourceRefs?: SourceRef[];
  };
  anglePenetration?: Partial<
    Record<"direct" | "slight" | "large" | "extreme", number>
  >;
  demolitionForce?: number;
  stagger?: number;
  push?: number;
  explosiveRelevant?: boolean;
  badrRelevant?: boolean;
  statusEffects?: string[];
  innerRadius?: number;
  outerRadius?: number;
  magazine?: number;
  spareMagazines?: number;
  fireRate?: number;
  reloadSeconds?: number;
  recoil?: number;
  firingModes?: string[];
  units?: Record<string, string>;
}

export interface DerivedField {
  formula: string;
  inputRefs: SourceRef[];
}

export interface AttackComponent {
  id: string;
  componentType: AttackComponentType;
  label: string;
  chargeLevel?: string;
  rawFields?: Record<string, string | number | boolean | null>;
  fields: AttackComponentFields;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  derived?: Record<string, DerivedField>;
}

export interface AttackProfile {
  version: string;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  components: AttackComponent[];
  primaryComponentId?: string;
  representativeRule?: string;
}

export interface AttackTaxonomy {
  version: string;
  taxonomySource: string;
  scaleVersion: string;
  sourceRefs: SourceRef[];
  options: Array<{ value: number; labelEn: string; labelZh: string }>;
}

export interface Warbond {
  id: string;
  nameZh: string;
  nameEn?: string;
  kind: "sample" | "warbond";
  superCredits: number | null;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  pageThresholds?: Array<{
    page: number;
    incrementalMedals: number;
    cumulativeMedals: number;
    sourceRefs: SourceRef[];
  }>;
}

export type CurrencyType = "medals" | "requisition-slips" | "super-credits";

export interface CurrencyAmount {
  type: CurrencyType;
  amount: number;
}

export interface WarbondAcquisition {
  kind: "warbond";
  warbondId: string;
  page: number | null;
  itemMedals: number | null;
  pageUnlockMedals: number | null;
  /** Additional medals required after reaching the preceding page. */
  pageIncrementalMedals?: number | null;
  sourceRefs?: SourceRef[];
  conflictRefs?: SourceRef[];
}

export interface RequisitionAcquisition {
  kind: "requisition";
  levelRequired: number | null;
  requisitionPoints: number | null;
  sourceRefs?: SourceRef[];
}

export interface DefaultAcquisition {
  kind: "default";
  sourceRefs?: SourceRef[];
}

export interface SuperstoreAcquisition {
  kind: "superstore";
  superCredits: number | null;
  status: "rotation" | "unavailable" | "pending";
  sourceRefs?: SourceRef[];
}

export interface UnavailableAcquisition {
  kind: "unavailable";
  reason: string;
  sourceRefs?: SourceRef[];
}

export interface EditionAcquisition {
  kind: "edition";
  editionName: string;
  price: number | null;
  currency?: CurrencyType;
  currencyCode?: "USD";
  status: "available" | "unavailable" | "pending";
  sourceRefs?: SourceRef[];
}

export interface EventAcquisition {
  kind: "event";
  eventName: string;
  status: "available" | "ended" | "pending";
  componentAcquisitions?: Array<{
    component: "body" | "helmet" | "item";
    label: string;
    acquisition: "event" | "edition" | "default" | "unavailable";
    sourceRefs?: SourceRef[];
  }>;
  sourceRefs?: SourceRef[];
}

export interface PoiAcquisition {
  kind: "poi";
  location: string;
  status: "available" | "unavailable" | "pending";
  sourceRefs?: SourceRef[];
}

export interface OtherAcquisition {
  kind: "other";
  label: string;
  status: "available" | "unavailable" | "pending";
  sourceRefs?: SourceRef[];
}

export type Acquisition =
  | WarbondAcquisition
  | RequisitionAcquisition
  | DefaultAcquisition
  | SuperstoreAcquisition
  | UnavailableAcquisition
  | EditionAcquisition
  | EventAcquisition
  | PoiAcquisition
  | OtherAcquisition;

export interface SearchFields {
  model: string;
  modelFormalName: string;
  formalName: string;
  englishName: string;
  aliases: string[];
  pinyinFull: string[];
  pinyinInitials: string[];
}

export interface GlossaryTerm {
  id: string;
  titleZh: string;
  aliases: string[];
  description: string;
  examples: string[];
  sourceRefs: SourceRef[];
  verificationStatus: "verified" | "pending";
}

export interface EquipmentStats {
  armor?: number;
  passive?: string;
  slot?: string;
}

export interface HandlingStats {
  magazine?: number;
  spareMagazines?: number;
  fireRate?: number;
  reloadSeconds?: number;
  recoil?: number;
  firingModes?: string[];
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
}

export interface Equipment {
  id: string;
  model: string;
  nameZh: string;
  nameEn: string;
  category: Category;
  slot?:
    | "primary"
    | "secondary"
    | "support"
    | "throwable"
    | "armor"
    | "stratagem"
    | "booster";
  image: AssetRecord;
  /** Build-time validated absolute Wiki equipment page; audit refs stay out of runtime. */
  wikiUrl?: string;
  aliases: Alias[];
  acquisition: Acquisition;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  admissionStatus: AdmissionStatus;
  translationEvidence: TranslationEvidence[];
  notes: string;
  search: SearchFields;
  attackProfile?: AttackProfile;
  handlingStats?: HandlingStats;
  /** Deprecated compatibility projection; not used for new filtering. */
  weaponProfile?: WeaponProfile;
  stats?: EquipmentStats;
  quarantineReason?: string;
}

export interface DataMeta {
  game: "HELLDIVERS 2";
  gameBuild: string;
  dataVersion: string;
  generatedAt: string;
  verificationStatus: VerificationStatus;
  unresolvedDifferences: string[];
}

export interface CatalogCoverage {
  wikiDiscovered: number;
  normalized: number;
  admitted: number;
  quarantined: number;
  translationEvidence: number;
  acquisitionComplete: number;
  imageCovered: number;
  attackParameters: number;
  warbondContentsCoverage?: WarbondContentsCoverage[];
}

export interface WarbondContentsCoverage {
  warbondId: string;
  nameEn: string | null;
  parsed: boolean;
  contentsSupportedCount: number;
  normalizedCount: number;
  admittedCount: number;
  ambiguityCount: number;
  fallbackCount: number;
  missingFromAdmitted: string[];
  parity: boolean;
}

export interface Catalog {
  meta: DataMeta;
  taxonomy: Taxonomy;
  warbonds: Warbond[];
  items: Equipment[];
  quarantine?: Equipment[];
  attackTaxonomy?: AttackTaxonomy;
  glossaryTerms: GlossaryTerm[];
  currencies?: {
    type: CurrencyType;
    labelZh: string;
    iconAssetPath: string;
    sourceRefs: SourceRef[];
  }[];
  coverage?: CatalogCoverage;
}

export interface CandidateRecord {
  id: string;
  rawText: string;
  submittedAt: string;
  source: "user";
  proposedEquipment: string;
  proposedWarbond: string;
  verificationStatus: "pending" | "accepted" | "rejected" | "misassigned";
  notes: string;
}

export interface CandidateLayer {
  version: string;
  records: CandidateRecord[];
}

export interface PlanState {
  schemaVersion: 2;
  pendingIds: string[];
  completedIds: string[];
  updatedAt: string;
}

export interface PlanLoadResult {
  state: PlanState;
  migrated: boolean;
  error?: string;
  orphanedIds?: string[];
}
