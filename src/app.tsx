import { registerSW } from "virtual:pwa-register";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import rawCandidates from "./data/candidates/user-supplied.json";
import { catalog, catalogItems, findEquipment } from "./data/catalog";
import type {
  CandidateLayer,
  Equipment,
  PlanState,
  SourceRef,
  TaxonomyDimension,
} from "./types";
import {
  loadPlanState,
  exportPlan,
  importPlan,
  reducePlan,
  savePlanState,
} from "./lib/plan-store";
import {
  searchEquipment,
  searchGlossary,
  type GlossarySearchResult,
  type SearchResult,
} from "./lib/search";
import {
  emptyWeaponFilters,
  getAmmoTraitOptions,
  getArmorPenetrationOptions,
  getDemolitionPowerOptions,
  getWeaponTypeOptions,
  matchesWeaponFilters,
  type WeaponFilters,
} from "./lib/weapon-filters";

const candidates = rawCandidates as CandidateLayer;
const knownIds = catalogItems.map((item) => item.id);
type Tab = "catalog" | "plan" | "about";

function assetUrl(path: string): string {
  return new URL(path, new URL(import.meta.env.BASE_URL, window.location.href))
    .href;
}

function sourceLabel(source: SourceRef): string {
  return source.url ? `${source.label} ↗` : source.label;
}

function statusLabel(status: string): string {
  return (
    { verified: "已核验", pending: "待核验", sample: "样例" }[status] ?? status
  );
}

function categoryLabel(category: Equipment["category"]): string {
  return {
    weapon: "武器",
    armor: "护甲",
    stratagem: "战备",
    grenade: "手雷",
    booster: "强化剂",
  }[category];
}

function acquisitionLabel(item: Equipment): string {
  switch (item.acquisition.kind) {
    case "warbond":
      return "债券装备";
    case "requisition":
      return "征用点战备";
    case "default":
      return "默认获取";
    case "superstore":
      return "超级商店";
    case "edition":
      return "版本奖励";
    case "event":
      return "活动获取";
    case "unavailable":
      return "不可获取";
    case "other":
      return "其他来源";
  }
}

function warbondLabel(warbondId: string): string {
  return (
    catalog.warbonds.find((warbond) => warbond.id === warbondId)?.nameZh ??
    "债券待核验"
  );
}

function updateItemQuery(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("item", id);
  else url.searchParams.delete("item");
  window.history.pushState({}, "", url);
}

function useItemFromQuery(): [string | null, (id: string | null) => void] {
  const read = () => new URLSearchParams(window.location.search).get("item");
  const [id, setId] = useState<string | null>(read);
  useEffect(() => {
    const onPopState = () => setId(read());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return [
    id,
    (nextId) => {
      updateItemQuery(nextId);
      setId(nextId);
    },
  ];
}

function ImageWithFallback({
  item,
  compact = false,
}: {
  item: Equipment;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.image.path]);
  if (failed)
    return (
      <div
        className={`image-fallback ${compact ? "image-fallback--compact" : ""}`}
        role="img"
        aria-label={item.image.alt}
      >
        {item.image.alt}
      </div>
    );
  return (
    <img
      className={compact ? "item-image item-image--compact" : "item-image"}
      src={assetUrl(item.image.path)}
      alt={item.image.alt}
      onError={() => setFailed(true)}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {statusLabel(status)}
    </span>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: WeaponFilters;
  onChange: (next: WeaponFilters) => void;
}) {
  const typeOptions = getWeaponTypeOptions(catalog);
  const ammoOptions = getAmmoTraitOptions(catalog);
  const penetrationOptions = getArmorPenetrationOptions(catalog);
  const demolitionOptions = getDemolitionPowerOptions(catalog);
  const dimensions = Object.values(catalog.taxonomy.dimensions).filter(
    Boolean,
  ) as TaxonomyDimension[];
  const hasFilterData =
    typeOptions.length > 0 ||
    ammoOptions.length > 0 ||
    penetrationOptions.length > 0 ||
    demolitionOptions.length > 0;

  const toggleAmmo = (value: string) => {
    const next = filters.ammoTraits.includes(value)
      ? filters.ammoTraits.filter((entry) => entry !== value)
      : [...filters.ammoTraits, value];
    onChange({ ...filters, ammoTraits: next });
  };

  return (
    <section className="filter-panel" aria-labelledby="filter-title">
      <div className="filter-heading">
        <div>
          <span className="eyebrow">来源驱动</span>
          <h2 id="filter-title">武器筛选</h2>
        </div>
        {(filters.weaponTypes.length > 0 ||
          filters.ammoTraits.length > 0 ||
          filters.armorPenetration !== null ||
          filters.demolitionPower !== null) && (
          <button
            className="text-button"
            type="button"
            onClick={() => onChange(emptyWeaponFilters())}
          >
            清除筛选
          </button>
        )}
      </div>
      {!hasFilterData && (
        <p className="muted filter-empty">
          当前 taxonomy
          尚未有已核验选项，筛选维度暂时隐藏。数据说明页会显示来源与版本状态。
        </p>
      )}
      {typeOptions.length > 0 && (
        <fieldset>
          <legend>武器类型</legend>
          <div className="chip-list">
            {typeOptions.map((option) => (
              <label className="filter-chip" key={option.value}>
                <input
                  type="checkbox"
                  checked={filters.weaponTypes.includes(option.value)}
                  onChange={() =>
                    onChange({
                      ...filters,
                      weaponTypes: filters.weaponTypes.includes(option.value)
                        ? filters.weaponTypes.filter(
                            (entry) => entry !== option.value,
                          )
                        : [...filters.weaponTypes, option.value],
                    })
                  }
                />
                <span>
                  {option.labelZh} <small>{option.count}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {ammoOptions.length > 0 && (
        <fieldset>
          <legend>弹药 / 介质（所选标签需同时存在）</legend>
          <div className="chip-list">
            {ammoOptions.map((option) => (
              <label className="filter-chip" key={option.value}>
                <input
                  type="checkbox"
                  checked={filters.ammoTraits.includes(option.value)}
                  onChange={() => toggleAmmo(option.value)}
                />
                <span>
                  {option.labelZh} <small>{option.count}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {penetrationOptions.length > 0 && (
        <fieldset>
          <legend>穿甲数值</legend>
          <div className="chip-list">
            {penetrationOptions.map((option) => (
              <label className="filter-chip" key={option.value}>
                <input
                  type="radio"
                  name="armor-penetration"
                  checked={filters.armorPenetration === option.value}
                  onChange={() =>
                    onChange({ ...filters, armorPenetration: option.value })
                  }
                />
                <span>
                  {option.value} <small>{option.count}</small>
                </span>
              </label>
            ))}
            <button
              className="filter-clear"
              type="button"
              onClick={() => onChange({ ...filters, armorPenetration: null })}
            >
              不限
            </button>
          </div>
        </fieldset>
      )}
      {demolitionOptions.length > 0 && (
        <fieldset>
          <legend>
            {catalog.taxonomy.dimensions.demolitionPower?.labelZh ?? "拆毁值"}
          </legend>
          <div className="chip-list">
            {demolitionOptions.map((option) => (
              <label className="filter-chip" key={option.value}>
                <input
                  type="radio"
                  name="demolition-power"
                  checked={filters.demolitionPower === option.value}
                  onChange={() =>
                    onChange({ ...filters, demolitionPower: option.value })
                  }
                />
                <span>
                  {option.value} <small>{option.count}</small>
                </span>
              </label>
            ))}
            <button
              className="filter-clear"
              type="button"
              onClick={() => onChange({ ...filters, demolitionPower: null })}
            >
              不限
            </button>
          </div>
        </fieldset>
      )}
      {dimensions.some(
        (dimension) => dimension.verificationStatus !== "verified",
      ) && (
        <p className="filter-footnote">
          未核验或没有可靠统一标尺的维度不会生成筛选项，也不会把待核验值算入覆盖数。
        </p>
      )}
    </section>
  );
}

function SearchCard({
  result,
  selected,
  onOpen,
  onAdd,
}: {
  result: SearchResult;
  selected: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <article
      className={`search-card ${selected ? "search-card--selected" : ""}`}
      onClick={onOpen}
    >
      <ImageWithFallback item={result.item} compact />
      <div className="search-card__body">
        <div className="card-meta">
          <span>{categoryLabel(result.item.category)}</span>
          <span>{result.item.model}</span>
        </div>
        <h3>{result.item.nameZh}</h3>
        <p className="english-name">{result.item.nameEn}</p>
        <p className="card-source">
          {acquisitionLabel(result.item)} ·{" "}
          <StatusBadge status={result.item.verificationStatus} />
        </p>
        {result.matchedAlias && (
          <p className="match-note">由外号命中：{result.matchedAlias}</p>
        )}
      </div>
      <button
        className="icon-button card-add"
        type="button"
        aria-label={`将 ${result.item.nameZh} 加入计划`}
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
      >
        ＋
      </button>
    </article>
  );
}

function GlossaryCard({ result }: { result: GlossarySearchResult }) {
  return (
    <article className="glossary-card">
      <div className="card-meta">
        <span>护甲社区术语</span>
        <StatusBadge status={result.term.verificationStatus} />
      </div>
      <h3>{result.term.titleZh}</h3>
      {result.matchedAlias && (
        <p className="match-note">由俗称命中：{result.matchedAlias}</p>
      )}
      <p>{result.term.description}</p>
      <p className="muted">帖子示例：{result.term.examples.join("、")}</p>
    </article>
  );
}

function AcquisitionDetails({ item }: { item: Equipment }) {
  const acquisition = item.acquisition;
  return (
    <div className="detail-block">
      <h3>获取方式</h3>
      <dl className="detail-list">
        <div>
          <dt>来源类型</dt>
          <dd>{acquisitionLabel(item)}</dd>
        </div>
        {acquisition.kind === "warbond" && (
          <>
            <div>
              <dt>债券</dt>
              <dd>{warbondLabel(acquisition.warbondId)}</dd>
            </div>
            <div>
              <dt>债券超级货币价格</dt>
              <dd>
                {catalog.warbonds.find(
                  (warbond) => warbond.id === acquisition.warbondId,
                )?.superCredits ?? "待核验"}
              </dd>
            </div>
            <div>
              <dt>页码</dt>
              <dd>{acquisition.page ?? "待核验"}</dd>
            </div>
            <div>
              <dt>页面勋章门槛</dt>
              <dd>
                {acquisition.pageUnlockMedals ?? "待核验"}{" "}
                <small>
                  进入该页前在此债券中消费的勋章，不是固定前置物品清单。
                </small>
              </dd>
            </div>
            <div>
              <dt>物品勋章价格</dt>
              <dd>{acquisition.itemMedals ?? "待核验"}</dd>
            </div>
            <div>
              <dt>从零开始理论总勋章</dt>
              <dd>
                {acquisition.pageUnlockMedals !== null &&
                acquisition.itemMedals !== null
                  ? acquisition.pageUnlockMedals + acquisition.itemMedals
                  : "待核验"}
              </dd>
            </div>
          </>
        )}
        {acquisition.kind === "requisition" && (
          <>
            <div>
              <dt>等级要求</dt>
              <dd>{acquisition.levelRequired ?? "待核验"}</dd>
            </div>
            <div>
              <dt>征用点价格</dt>
              <dd>{acquisition.requisitionPoints ?? "待核验"}</dd>
            </div>
          </>
        )}
        {acquisition.kind === "default" && (
          <div>
            <dt>状态</dt>
            <dd>默认自带</dd>
          </div>
        )}
        {acquisition.kind === "superstore" && (
          <>
            <div>
              <dt>超级货币价格</dt>
              <dd>{acquisition.superCredits ?? "待核验"}</dd>
            </div>
            <div>
              <dt>轮换状态</dt>
              <dd>
                {acquisition.status === "pending"
                  ? "待核验"
                  : acquisition.status}
              </dd>
            </div>
          </>
        )}
        {acquisition.kind === "unavailable" && (
          <div>
            <dt>说明</dt>
            <dd>{acquisition.reason}</dd>
          </div>
        )}
        {acquisition.kind === "edition" && (
          <>
            <div>
              <dt>版本</dt>
              <dd>{acquisition.editionName}</dd>
            </div>
            <div>
              <dt>价格</dt>
              <dd>{acquisition.price ?? "待核验"}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {acquisition.status === "pending"
                  ? "待核验"
                  : acquisition.status}
              </dd>
            </div>
          </>
        )}
        {acquisition.kind === "event" && (
          <>
            <div>
              <dt>活动</dt>
              <dd>{acquisition.eventName}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {acquisition.status === "pending"
                  ? "待核验"
                  : acquisition.status}
              </dd>
            </div>
          </>
        )}
        {acquisition.kind === "other" && (
          <>
            <div>
              <dt>来源</dt>
              <dd>{acquisition.label}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {acquisition.status === "pending"
                  ? "待核验"
                  : acquisition.status}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  );
}

function WeaponProfileDetails({ item }: { item: Equipment }) {
  if (item.category !== "weapon" || !item.weaponProfile) return null;
  const profile = item.weaponProfile;
  const dimension = (id: keyof typeof catalog.taxonomy.dimensions) =>
    catalog.taxonomy.dimensions[id];
  const taxonomyLabel = (id: "weaponType" | "ammoTraits", value: string) =>
    catalog.taxonomy.dimensions[id]?.options.find(
      (option) => option.id === value,
    )?.labelZh ?? value;
  const rows: Array<
    [
      string,
      string,
      (
        | typeof profile.weaponType
        | typeof profile.ammoTraits
        | typeof profile.armorPenetration
        | typeof profile.demolitionPower
      ),
      TaxonomyDimension | undefined,
    ]
  > = [
    [
      "武器类型",
      profile.weaponType
        ? taxonomyLabel("weaponType", profile.weaponType.value)
        : "",
      profile.weaponType,
      dimension("weaponType"),
    ],
    [
      "弹药 / 介质",
      profile.ammoTraits
        ? profile.ammoTraits.value
            .map((value) => taxonomyLabel("ammoTraits", value))
            .join("、")
        : "",
      profile.ammoTraits,
      dimension("ammoTraits"),
    ],
    [
      "穿甲数值",
      profile.armorPenetration?.value.toString() ?? "",
      profile.armorPenetration,
      dimension("armorPenetration"),
    ],
    [
      "拆毁值",
      profile.demolitionPower?.value.toString() ?? "",
      profile.demolitionPower,
      dimension("demolitionPower"),
    ],
  ];
  const visibleRows = rows.filter(
    ([, value, field, currentDimension]) =>
      value &&
      field?.verificationStatus === "verified" &&
      currentDimension?.verificationStatus === "verified",
  );
  if (visibleRows.length === 0) return null;
  return (
    <div className="detail-block">
      <h3>
        武器属性 <small>按 taxonomy 展示</small>
      </h3>
      <dl className="detail-list">
        {visibleRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DetailPanel({
  item,
  onClose,
  onAdd,
}: {
  item: Equipment;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <section
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="close-button"
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
        >
          ×
        </button>
        <div className="detail-hero">
          <ImageWithFallback item={item} />
          <div>
            <span className="eyebrow">
              {categoryLabel(item.category)} · {item.model}
            </span>
            <h2 id="detail-title">{item.nameZh}</h2>
            <p className="english-name">{item.nameEn}</p>
            <StatusBadge status={item.verificationStatus} />
          </div>
        </div>
        <p className="notice notice--sample">{item.notes}</p>
        <WeaponProfileDetails item={item} />
        <AcquisitionDetails item={item} />
        <div className="detail-block">
          <h3>来源记录</h3>
          <ul className="source-list">
            {item.sourceRefs.map((source) => (
              <li key={`${source.kind}-${source.label}`}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {sourceLabel(source)}
                  </a>
                ) : (
                  sourceLabel(source)
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="detail-actions">
          <button className="primary-button" type="button" onClick={onAdd}>
            加入解锁计划
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            返回速查
          </button>
        </div>
      </section>
    </div>
  );
}

function planCost(item: Equipment): string {
  switch (item.acquisition.kind) {
    case "warbond":
      return item.acquisition.itemMedals === null
        ? "勋章：待核验"
        : `勋章：${item.acquisition.itemMedals}`;
    case "requisition":
      return item.acquisition.requisitionPoints === null
        ? "征用点：待核验"
        : `征用点：${item.acquisition.requisitionPoints}`;
    case "superstore":
      return item.acquisition.superCredits === null
        ? "超级货币：待核验"
        : `超级货币：${item.acquisition.superCredits}`;
    case "default":
      return "默认自带";
    case "unavailable":
      return "不可获取";
    case "edition":
      return item.acquisition.price === null
        ? "版本价格：待核验"
        : `版本价格：${item.acquisition.price}`;
    case "event":
      return item.acquisition.status === "pending"
        ? "活动状态：待核验"
        : `活动：${item.acquisition.status}`;
    case "other":
      return item.acquisition.status === "pending"
        ? "来源：待核验"
        : item.acquisition.label;
  }
}

function PlanItem({
  item,
  index,
  total,
  onAction,
  onDragStart,
  onDrop,
}: {
  item: Equipment;
  index: number;
  total: number;
  onAction: (action: Parameters<typeof reducePlan>[1]) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  return (
    <li
      className="plan-item"
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <ImageWithFallback item={item} compact />
      <div className="plan-item__body">
        <strong>{item.nameZh}</strong>
        <span>
          {item.model} · {planCost(item)}
        </span>
      </div>
      <div className="plan-item__actions">
        <button
          className="icon-button"
          type="button"
          disabled={index === 0}
          aria-label="上移"
          onClick={() =>
            onAction({ type: "move", id: item.id, toIndex: index - 1 })
          }
        >
          ↑
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={index === total - 1}
          aria-label="下移"
          onClick={() =>
            onAction({ type: "move", id: item.id, toIndex: index + 1 })
          }
        >
          ↓
        </button>
        <button
          className="icon-button icon-button--success"
          type="button"
          aria-label={`标记 ${item.nameZh} 已完成`}
          onClick={() => onAction({ type: "complete", id: item.id })}
        >
          ✓
        </button>
        <button
          className="icon-button icon-button--danger"
          type="button"
          aria-label={`删除 ${item.nameZh}`}
          onClick={() => onAction({ type: "remove", id: item.id })}
        >
          ×
        </button>
      </div>
    </li>
  );
}

interface PlanGroup {
  key: string;
  label: string;
  items: Array<{ item: Equipment; index: number }>;
}

function groupPendingItems(items: Equipment[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();
  items.forEach((item, index) => {
    const key =
      item.acquisition.kind === "warbond"
        ? `warbond:${item.acquisition.warbondId}`
        : `source:${item.acquisition.kind}`;
    const label =
      item.acquisition.kind === "warbond"
        ? `债券 · ${warbondLabel(item.acquisition.warbondId)}`
        : acquisitionLabel(item);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push({ item, index });
    groups.set(key, group);
  });
  return [...groups.values()];
}

function PlanView({
  plan,
  onPlanChange,
  onOpen,
}: {
  plan: PlanState;
  onPlanChange: (next: PlanState) => void;
  onOpen: (id: string) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const dragId = useRef<string | null>(null);
  const pending = plan.pendingIds
    .map(findEquipment)
    .filter((item): item is Equipment => Boolean(item));
  const completed = plan.completedIds
    .map(findEquipment)
    .filter((item): item is Equipment => Boolean(item));
  const pendingGroups = groupPendingItems(pending);
  const dispatch = (action: Parameters<typeof reducePlan>[1]) =>
    onPlanChange(reducePlan(plan, action, knownIds));
  const download = () => {
    const blob = new Blob([exportPlan(plan)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hd2-supply-plan.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const importFile = (event: JSX.TargetedEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    file.text().then((raw) => {
      try {
        onPlanChange(importPlan(raw, knownIds));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "计划导入失败。");
      }
      event.currentTarget.value = "";
    });
  };
  return (
    <section className="page-section plan-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            本地保存 · schema v{plan.schemaVersion}
          </span>
          <h1>解锁计划</h1>
          <p>
            只记录你手动加入的条目；不会计算账号债券进度，也不会把共享页面门槛重复相加。
          </p>
        </div>
        <div className="plan-tools">
          <button className="secondary-button" type="button" onClick={download}>
            导出 JSON
          </button>
          <label className="secondary-button file-button">
            导入 JSON
            <input
              type="file"
              accept="application/json"
              onChange={importFile}
            />
          </label>
        </div>
      </div>
      <div className="notice">
        <strong>成本口径：</strong>
        每项只显示自己的理论成本，勋章、征用点和超级货币分栏；未知值保留“待核验”。拖动条目或使用上下箭头排序。
      </div>
      <div className="plan-list">
        <h2>
          待购 <span>{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <div className="empty-state">
            还没有加入计划。返回速查，选择一个条目即可开始。
          </div>
        ) : (
          pendingGroups.map((group) => (
            <section className="plan-group" key={group.key}>
              <div className="plan-group__heading">
                <h3>{group.label}</h3>
                <span>{group.items.length} 项</span>
              </div>
              <ol>
                {group.items.map(({ item, index }) => (
                  <PlanItem
                    key={item.id}
                    item={item}
                    index={index}
                    total={pending.length}
                    onAction={dispatch}
                    onDragStart={() => {
                      dragId.current = item.id;
                    }}
                    onDrop={() => {
                      if (dragId.current && dragId.current !== item.id)
                        dispatch({
                          type: "move",
                          id: dragId.current,
                          toIndex: index,
                        });
                      dragId.current = null;
                    }}
                  />
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
      <div className="completed-section">
        <button
          className="section-toggle"
          type="button"
          aria-expanded={showCompleted}
          onClick={() => setShowCompleted(!showCompleted)}
        >
          <span>{showCompleted ? "▾" : "▸"} 已完成</span>
          <span>{completed.length}</span>
        </button>
        {showCompleted && (
          <div className="plan-list plan-list--completed">
            {completed.length === 0 ? (
              <p className="muted">暂无已完成条目。</p>
            ) : (
              <ol>
                {completed.map((item) => (
                  <li className="plan-item" key={item.id}>
                    <ImageWithFallback item={item} compact />
                    <div className="plan-item__body">
                      <strong>{item.nameZh}</strong>
                      <span>
                        {item.model} · {planCost(item)}
                      </span>
                    </div>
                    <div className="plan-item__actions">
                      <button
                        className="icon-button icon-button--success"
                        type="button"
                        onClick={() =>
                          dispatch({ type: "restore", id: item.id })
                        }
                        aria-label={`恢复 ${item.nameZh}`}
                      >
                        ↶
                      </button>
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        onClick={() =>
                          dispatch({ type: "remove-completed", id: item.id })
                        }
                        aria-label={`彻底删除 ${item.nameZh}`}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {pending.length > 0 && (
        <div className="plan-summary">
          <strong>计划条目：{pending.length}</strong>
          <span>共享页面门槛未汇总 · 账号剩余成本未知</span>
        </div>
      )}
      {pending.map((item) => (
        <button
          className="sr-only"
          key={`open-${item.id}`}
          onClick={() => onOpen(item.id)}
        >
          {item.nameZh}
        </button>
      ))}
    </section>
  );
}

function AboutView() {
  const dimensions = Object.values(catalog.taxonomy.dimensions).filter(
    Boolean,
  ) as TaxonomyDimension[];
  return (
    <section className="page-section about-page">
      <span className="eyebrow">数据契约与来源</span>
      <h1>数据说明</h1>
      <div className="notice notice--sample">
        <strong>非官方社区数据。</strong> 当前 38 个装备条目与 53
        个俗称来自用户提供全文的小黑盒社区帖；俗称已有社区出处，但正式中文名、价格、页码、获取方式与图片仍需逐项复核。
      </div>
      <div className="about-grid">
        <article className="info-card">
          <h2>当前版本</h2>
          <dl className="detail-list">
            <div>
              <dt>游戏 build</dt>
              <dd>{catalog.meta.gameBuild}</dd>
            </div>
            <div>
              <dt>数据版本</dt>
              <dd>{catalog.meta.dataVersion}</dd>
            </div>
            <div>
              <dt>生成时间</dt>
              <dd>{catalog.meta.generatedAt}</dd>
            </div>
            <div>
              <dt>核验状态</dt>
              <dd>
                <StatusBadge status={catalog.meta.verificationStatus} />
              </dd>
            </div>
          </dl>
        </article>
        <article className="info-card">
          <h2>候选层</h2>
          <p>
            用户提供的 {candidates.records.length} 条“称呼–债券”候选保存在独立
            pending
            层并保留原始拼写。社区帖子独立佐证的装备与俗称已进入搜索；候选记录本身仍不会自动覆盖目录。
          </p>
          <p className="muted">
            同步/核验后可标记为正式名、别名、误配或拒绝；在此之前不会影响检索结果。
          </p>
        </article>
      </div>
      <article className="info-card">
        <h2>武器属性 taxonomy</h2>
        <p>
          筛选项只由版本化 taxonomy
          生成。没有可靠统一体系时，维度隐藏，不用产品假设填充。
        </p>
        <div className="taxonomy-list">
          {dimensions.map((dimension) => (
            <div className="taxonomy-row" key={dimension.id}>
              <div>
                <strong>{dimension.labelZh}</strong>
                <span>
                  {dimension.id} · {dimension.valueKind}
                </span>
              </div>
              <StatusBadge status={dimension.verificationStatus} />
              <small>
                {dimension.taxonomySource} / {dimension.scaleVersion}
              </small>
            </div>
          ))}
        </div>
      </article>
      <article className="info-card">
        <h2>未决差异</h2>
        <ul>
          {catalog.meta.unresolvedDifferences.map((difference) => (
            <li key={difference}>{difference}</li>
          ))}
        </ul>
      </article>
      <p className="legal-note">
        HD2 军需簿是非官方项目，与 Arrowhead Game Studios、Sony 或 PlayStation
        无隶属关系。游戏名称、商标和游戏素材归各自权利人所有；本仓库的源码许可与游戏数据/素材许可分开记录。
      </p>
    </section>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<WeaponFilters>(emptyWeaponFilters);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useItemFromQuery();
  const searchRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<PlanState>(
    () =>
      loadPlanState(
        typeof window === "undefined" ? null : window.localStorage,
        knownIds,
      ).state,
  );
  const [planNotice, setPlanNotice] = useState<string | undefined>(
    () =>
      loadPlanState(
        typeof window === "undefined" ? null : window.localStorage,
        knownIds,
      ).error,
  );
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    const load = loadPlanState(window.localStorage, knownIds);
    setPlan(load.state);
    setPlanNotice(
      load.error ??
        (load.migrated ? "已将旧版本地计划迁移到当前 schema。" : undefined),
    );
    updateRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedsRefresh(true),
    });
  }, []);
  useEffect(() => {
    savePlanState(window.localStorage, plan);
  }, [plan]);

  const results = useMemo(
    () =>
      searchEquipment(catalogItems, query).filter((result) =>
        matchesWeaponFilters(result.item, filters, catalog),
      ),
    [query, filters],
  );
  const glossaryResults = useMemo(
    () => searchGlossary(catalog.glossaryTerms, query),
    [query],
  );
  const selected = selectedId ? findEquipment(selectedId) : undefined;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, filters]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        target?.tagName !== "INPUT" &&
        target?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && selected) setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, setSelectedId]);

  const dispatchPlan = (next: PlanState) => {
    setPlan(next);
    setPlanNotice(undefined);
  };
  const addToPlan = (id: string) =>
    dispatchPlan(reducePlan(plan, { type: "add", id }, knownIds));
  const openItem = (id: string) => setSelectedId(id);
  const onSearchKeyDown = (
    event: JSX.TargetedKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(results.length - 1, 0)),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      openItem(results[activeIndex].item.id);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            HD2
          </div>
          <div>
            <span className="eyebrow">非官方 · 离线优先</span>
            <h1>军需簿</h1>
          </div>
        </div>
        <div className="header-meta">
          <span>build {catalog.meta.gameBuild}</span>
          <span>数据 {catalog.meta.dataVersion}</span>
          <StatusBadge status={catalog.meta.verificationStatus} />
        </div>
      </header>
      {planNotice && (
        <div className="app-notice" role="status">
          {planNotice}
          <button
            type="button"
            onClick={() => setPlanNotice(undefined)}
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}
      {needsRefresh && (
        <div className="app-notice app-notice--update" role="status">
          发现新版本。
          <button type="button" onClick={() => updateRef.current?.(true)}>
            立即刷新
          </button>
        </div>
      )}
      <nav className="main-nav" aria-label="主导航">
        {(
          [
            ["catalog", "速查"],
            [
              "plan",
              `解锁计划${plan.pendingIds.length ? ` · ${plan.pendingIds.length}` : ""}`,
            ],
            ["about", "数据说明"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={
              tab === value ? "nav-button nav-button--active" : "nav-button"
            }
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        {tab === "catalog" && (
          <section className="catalog-page page-section">
            <div className="catalog-heading">
              <div>
                <span className="eyebrow">快速检索 · 按来源核验</span>
                <h1>找到你的装备</h1>
                <p>
                  正式目录只收有来源的记录；样例数据不会伪装成当前完整数据库。
                </p>
              </div>
              <div className="catalog-count">
                <strong>{results.length + glossaryResults.length}</strong>
                <span>匹配条目</span>
              </div>
            </div>
            <label className="search-box">
              <span className="search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onInput={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="搜索名称、型号、英文、外号或拼音…"
                aria-label="搜索装备"
                aria-activedescendant={
                  results[activeIndex]
                    ? `result-${results[activeIndex].item.id}`
                    : undefined
                }
              />
              <kbd>/</kbd>
            </label>
            <FilterBar filters={filters} onChange={setFilters} />
            {glossaryResults.length > 0 && (
              <section className="glossary-results" aria-label="社区术语结果">
                {glossaryResults.map((result) => (
                  <GlossaryCard result={result} key={result.term.id} />
                ))}
              </section>
            )}
            <div
              className="search-results"
              role="listbox"
              aria-label="装备搜索结果"
            >
              {results.length === 0 && glossaryResults.length === 0 ? (
                <div className="empty-state">
                  没有符合条件的条目。若这是正式数据，请先检查 taxonomy
                  和来源核验状态。
                </div>
              ) : results.length > 0 ? (
                results.map((result, index) => (
                  <div
                    id={`result-${result.item.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    key={result.item.id}
                  >
                    <SearchCard
                      result={result}
                      selected={index === activeIndex}
                      onOpen={() => openItem(result.item.id)}
                      onAdd={() => addToPlan(result.item.id)}
                    />
                  </div>
                ))
              ) : null}
            </div>
          </section>
        )}
        {tab === "plan" && (
          <PlanView plan={plan} onPlanChange={dispatchPlan} onOpen={openItem} />
        )}
        {tab === "about" && <AboutView />}
      </main>
      {selected && (
        <DetailPanel
          item={selected}
          onClose={() => setSelectedId(null)}
          onAdd={() => {
            addToPlan(selected.id);
            setTab("plan");
            setSelectedId(null);
          }}
        />
      )}
      <footer className="app-footer">
        源码与数据分开许可 · 无账号 · 无后端 · 不收集分析数据
      </footer>
    </div>
  );
}
