export type ProductKind =
  | "primary-weapon"
  | "secondary-weapon"
  | "support-weapon"
  | "grenade"
  | "body-armor"
  | "other-stratagem";

export type BrowseCategory = "weapon" | "grenade" | "stratagem" | "armor";
export type CurrencyType = "medals" | "requisition-slips" | "super-credits";

export interface WikiAnchor {
  pageId?: number;
  revision?: number | string;
  url?: string;
}

export interface CurrencyDefinition {
  type: CurrencyType;
  labelZh: string;
  iconAssetPath: string;
}

export interface Warbond {
  id: string;
  nameZh: string;
  nameEn?: string;
  superCredits: number | null;
  pages: Array<{ page: number; cumulativeMedals: number | null }>;
  wiki?: WikiAnchor;
}

export interface WarbondAcquisition {
  kind: "warbond";
  warbondId: string;
  page: number | null;
  itemMedals: number | null;
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
  currency?: CurrencyType;
  currencyCode?: "USD";
  status: "available" | "unavailable" | "pending";
}

export interface EventAcquisition {
  kind: "event";
  eventName: string;
  status: "available" | "ended" | "pending";
}

export interface PoiAcquisition {
  kind: "poi";
  location: string;
  status: "available" | "unavailable" | "pending";
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
  | PoiAcquisition
  | OtherAcquisition;

export interface ArmorPenetration {
  value?: number;
  minValue?: number;
  maxValue?: number;
  labelZh?: string;
}

export interface AttackFields {
  standardDamage?: number;
  durableDamage?: number;
  dps?: number;
  armorPenetration?: ArmorPenetration;
  demolitionForce?: number;
  stagger?: number;
  push?: number;
  statusEffects?: string[];
  innerRadius?: number;
  outerRadius?: number;
  magazine?: number;
  spareMagazines?: number;
  fireRate?: number;
  reloadSeconds?: number;
  recoil?: number;
  firingModes?: string[];
}

export interface AttackComponent {
  id: string;
  type: string;
  label: string;
  chargeLevel?: string;
  fields: AttackFields;
}

export interface CombatProfile {
  components: AttackComponent[];
  primaryComponentId?: string;
}

export interface HandlingStats {
  magazine?: number;
  spareMagazines?: number;
  fireRate?: number;
  reloadSeconds?: number;
  recoil?: number;
  firingModes?: string[];
}

export interface ArmorStats {
  class?: string;
  rating?: number;
  speed?: number;
  staminaRegen?: number;
  passive?: string;
}

export interface DeploymentStats {
  type?: string;
  code?: Array<"up" | "down" | "left" | "right">;
  cooldownSeconds?: number;
  callInSeconds?: number;
  uses?: number;
}

export interface Equipment {
  id: string;
  productKind: ProductKind;
  model?: string;
  nameZh: string;
  nameEn: string;
  localization: {
    status: "official" | "community-reviewed" | "manual";
    keys?: number[];
  };
  weaponType?: string;
  alternateNames?: string[];
  image: { path: string; alt: string; filePage?: string; license?: string };
  wiki?: WikiAnchor;
  acquisition: Acquisition;
  combat?: CombatProfile;
  handling?: HandlingStats;
  armor?: ArmorStats;
  deployment?: DeploymentStats;
}

export interface Catalog {
  meta: {
    game: "HELLDIVERS 2";
    gameBuild: string | null;
    dataVersion: string;
    capturedAt: string;
    demolitionSource?: {
      capturedAt: string;
      importedComponents: number;
      modules: Array<{ title: string; revision: number }>;
    };
  };
  idAliases: Record<string, string>;
  currencies: CurrencyDefinition[];
  warbonds: Warbond[];
  items: Equipment[];
}

export interface CommunityAliases {
  version: string;
  source: { label: string; url: string };
  entries: Array<{ equipmentId: string; aliases: string[] }>;
}

export interface PlanState {
  schemaVersion: 2;
  pendingIds: string[];
  completedIds: string[];
  updatedAt: string;
}

export interface PlanLoadResult {
  state: PlanState;
  error?: string;
}
