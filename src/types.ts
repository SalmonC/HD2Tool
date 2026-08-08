export type Category = "weapon" | "armor" | "stratagem" | "grenade" | "booster";

export type VerificationStatus = "verified" | "pending" | "sample";

export type SourceKind =
  "local-fixture" | "game-data" | "official" | "community" | "wiki" | "manual";

export interface SourceRef {
  kind: SourceKind;
  label: string;
  url?: string;
}

export interface Alias {
  text: string;
  kind: "community" | "model" | "translation" | "other";
  sourceRefs: SourceRef[];
  reviewStatus: "verified" | "pending" | "rare";
}

export interface AssetRecord {
  path: string;
  alt: string;
  status: "placeholder" | "candidate" | "verified";
  originalPage: string | null;
  author: string | null;
  syncedAt: string;
  fileHash: string | null;
  sourceRefs: SourceRef[];
  licenseStatus: "project-created-placeholder" | "pending" | "documented";
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
  numberScale?: {
    min: number;
    max: number;
    step: number;
    unit?: string;
  };
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

export interface WeaponProfile {
  weaponType?: VerifiedField<string>;
  ammoTraits?: VerifiedField<string[]>;
  armorPenetration?: VerifiedField<number>;
  demolitionPower?: VerifiedField<number>;
}

export interface Warbond {
  id: string;
  nameZh: string;
  kind: "sample" | "warbond";
  superCredits: number | null;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
}

export interface WarbondAcquisition {
  kind: "warbond";
  warbondId: string;
  page: number | null;
  itemMedals: number | null;
  pageUnlockMedals: number | null;
}

export interface RequisitionAcquisition {
  kind: "requisition";
  levelRequired: number | null;
  requisitionPoints: number | null;
}

export interface DefaultAcquisition {
  kind: "default";
}

export interface SuperstoreAcquisition {
  kind: "superstore";
  superCredits: number | null;
  status: "rotation" | "unavailable" | "pending";
}

export interface UnavailableAcquisition {
  kind: "unavailable";
  reason: string;
}

export interface EditionAcquisition {
  kind: "edition";
  editionName: string;
  price: number | null;
  status: "available" | "unavailable" | "pending";
}

export interface EventAcquisition {
  kind: "event";
  eventName: string;
  status: "available" | "ended" | "pending";
}

export interface OtherAcquisition {
  kind: "other";
  label: string;
  status: "available" | "unavailable" | "pending";
}

export type Acquisition =
  | WarbondAcquisition
  | RequisitionAcquisition
  | DefaultAcquisition
  | SuperstoreAcquisition
  | UnavailableAcquisition
  | EditionAcquisition
  | EventAcquisition
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

export interface Equipment {
  id: string;
  model: string;
  nameZh: string;
  nameEn: string;
  category: Category;
  image: AssetRecord;
  aliases: Alias[];
  acquisition: Acquisition;
  sourceRefs: SourceRef[];
  verificationStatus: VerificationStatus;
  notes: string;
  search: SearchFields;
  weaponProfile?: WeaponProfile;
}

export interface DataMeta {
  game: "HELLDIVERS 2";
  gameBuild: string;
  dataVersion: string;
  generatedAt: string;
  verificationStatus: VerificationStatus;
  unresolvedDifferences: string[];
}

export interface Catalog {
  meta: DataMeta;
  taxonomy: Taxonomy;
  warbonds: Warbond[];
  items: Equipment[];
  glossaryTerms: GlossaryTerm[];
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
  schemaVersion: 1;
  pendingIds: string[];
  completedIds: string[];
  updatedAt: string;
}

export interface PlanLoadResult {
  state: PlanState;
  migrated: boolean;
  error?: string;
}
