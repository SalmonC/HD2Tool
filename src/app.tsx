import { registerSW } from "virtual:pwa-register";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { catalog, catalogItems, findEquipment } from "./data/catalog";
import type { Equipment, PlanLoadResult, PlanState } from "./types";
import { AcquisitionSummary, CurrencyAmountView } from "./lib/currency";
import { AnglePenetrationDetails, APBadges } from "./lib/attack-summary";
import { searchEquipment, type SearchResult } from "./lib/search";
import {
  emptyWeaponFilters,
  getAmmoTraitOptions,
  getArmorPenetrationOptions,
  getDemolitionPowerOptions,
  getWeaponTypeOptions,
  matchesWeaponFilters,
  type WeaponFilters,
} from "./lib/weapon-filters";
import {
  exportPlan,
  importPlan,
  loadPlanState,
  PLAN_RECOVERY_KEY,
  reducePlan,
  savePlanState,
} from "./lib/plan-store";
import { summarizePlanCosts } from "./lib/plan-totals";
import { resolveAssetUrl } from "./lib/asset-url";
import { EquipmentWikiLink } from "./lib/equipment-wiki-link";

const knownIds = catalogItems.map((item) => item.id);
const categoryLabels: Record<Equipment["category"], string> = {
  weapon: "武器",
  armor: "护甲",
  stratagem: "战备",
  grenade: "投掷物",
  booster: "强化剂",
};
const slotLabels: Record<string, string> = {
  primary: "主武器",
  secondary: "副武器",
  support: "支援武器",
  throwable: "投掷物",
  armor: "护甲",
  stratagem: "战备",
  booster: "强化剂",
};

function assetUrl(path: string): string {
  return resolveAssetUrl(path, import.meta.env.BASE_URL, document.baseURI);
}
function updateItemQuery(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("item", id);
  else url.searchParams.delete("item");
  window.history.pushState({}, "", url);
}
function useItemQuery(): [string | null, (id: string | null) => void] {
  const read = () => new URLSearchParams(window.location.search).get("item");
  const [id, setId] = useState<string | null>(read);
  useEffect(() => {
    const handler = () => setId(read());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return [
    id,
    (next) => {
      updateItemQuery(next);
      setId(next);
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
        <span>{categoryLabels[item.category]}</span>
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

function categoryLabel(item: Equipment): string {
  return categoryLabels[item.category];
}
function gameTags(item: Equipment): string[] {
  const tags = [categoryLabel(item), item.slot ? slotLabels[item.slot] : ""];
  const weaponType = item.attackProfile?.components[0]?.label;
  if (weaponType) tags.push(weaponType);
  return [...new Set(tags.filter(Boolean))].slice(0, 3);
}

function FilterPanel({
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
  if (
    !typeOptions.length &&
    !ammoOptions.length &&
    !penetrationOptions.length &&
    !demolitionOptions.length
  )
    return null;
  const active =
    filters.weaponTypes.length ||
    filters.ammoTraits.length ||
    filters.armorPenetration !== null ||
    filters.demolitionPower !== null;
  return (
    <details className="filter-panel">
      <summary>筛选{active ? " · 已启用" : ""}</summary>
      <div className="filter-panel__body">
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
                              (value) => value !== option.value,
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
            <legend>介质标签（可多选）</legend>
            <div className="chip-list">
              {ammoOptions.map((option) => (
                <label className="filter-chip" key={option.value}>
                  <input
                    type="checkbox"
                    checked={filters.ammoTraits.includes(option.value)}
                    onChange={() =>
                      onChange({
                        ...filters,
                        ammoTraits: filters.ammoTraits.includes(option.value)
                          ? filters.ammoTraits.filter(
                              (value) => value !== option.value,
                            )
                          : [...filters.ammoTraits, option.value],
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
            </div>
          </fieldset>
        )}
        {demolitionOptions.length > 0 && (
          <fieldset>
            <legend>拆毁值</legend>
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
            </div>
          </fieldset>
        )}
        <button
          className="text-button"
          type="button"
          onClick={() => onChange(emptyWeaponFilters())}
        >
          清除筛选
        </button>
      </div>
    </details>
  );
}

function AddButton({
  item,
  included,
  onAdd,
}: {
  item: Equipment;
  included: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      className={`primary-button ${included ? "primary-button--done" : ""}`}
      type="button"
      aria-label={`${included ? "已在计划中" : "加入购买计划"}：${item.nameZh}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!included) onAdd();
      }}
    >
      {included ? "已在计划中" : "加入购买计划"}
    </button>
  );
}

function SearchCard({
  result,
  included,
  selected,
  onOpen,
  onAdd,
}: {
  result: SearchResult;
  included: boolean;
  selected: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const item = result.item;
  const openOnKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <article
      className={`search-card ${selected ? "search-card--selected" : ""}`}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openOnKey}
    >
      <ImageWithFallback item={item} compact />
      <div className="search-card__body">
        <div className="card-meta">
          <span>{item.model !== "—" ? item.model : ""}</span>
          <span>{categoryLabel(item)}</span>
        </div>
        <h3>{item.nameZh}</h3>
        {item.aliases.length > 0 && (
          <p className="aliases">
            外号：
            {item.aliases
              .map((alias) => (
                <span
                  className={
                    result.matchedAlias === alias.text ? "alias--hit" : ""
                  }
                  key={alias.text}
                >
                  {alias.text}
                </span>
              ))
              .reduce(
                (nodes, node, index) =>
                  index === 0 ? [node] : [...nodes, "、", node],
                [] as ComponentChildren[],
              )}
          </p>
        )}
        <div className="game-tags">
          {gameTags(item).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <APBadges item={item} catalog={catalog} />
        <AcquisitionSummary item={item} catalog={catalog} compact />
        <AddButton item={item} included={included} onAdd={onAdd} />
      </div>
    </article>
  );
}

function PrimaryStats({ item }: { item: Equipment }) {
  const component =
    item.attackProfile?.components.find(
      (entry) => entry.id === item.attackProfile?.primaryComponentId,
    ) ?? item.attackProfile?.components[0];
  if (!component) return null;
  const fields = component.fields;
  const handling = item.handlingStats;
  const stats: Array<[string, string | number]> = [];
  if (fields.standardDamage !== undefined)
    stats.push(["伤害", fields.standardDamage]);
  if (fields.durableDamage !== undefined)
    stats.push(["耐久伤害", fields.durableDamage]);
  if (fields.demolitionForce !== undefined)
    stats.push(["拆毁值", fields.demolitionForce]);
  if (fields.dps !== undefined) stats.push(["DPS", fields.dps]);
  if (handling?.magazine !== undefined) stats.push(["容量", handling.magazine]);
  if (handling?.spareMagazines !== undefined)
    stats.push(["备用弹匣", handling.spareMagazines]);
  if (handling?.fireRate !== undefined)
    stats.push(["射速", `${handling.fireRate} rpm`]);
  if (handling?.reloadSeconds !== undefined)
    stats.push(["装填", `${handling.reloadSeconds} s`]);
  if (handling?.recoil !== undefined) stats.push(["后坐力", handling.recoil]);
  if (!stats.length) return null;
  return (
    <section className="detail-section">
      <h3>核心参数</h3>
      <dl className="stat-grid">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EquipmentDetails({
  item,
  included,
  onClose,
  onAdd,
}: {
  item: Equipment;
  included: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <section
      className="equipment-details"
      aria-labelledby="equipment-detail-title"
    >
      <div className="detail-topline">
        <button className="text-button" type="button" onClick={onClose}>
          返回结果
        </button>
        <span>装备详情</span>
      </div>
      <div className="detail-hero">
        <ImageWithFallback item={item} />
        <div>
          <p className="detail-kicker">
            {item.model !== "—" ? item.model : categoryLabel(item)} ·{" "}
            {item.slot ? slotLabels[item.slot] : categoryLabel(item)}
          </p>
          <h2 id="equipment-detail-title">{item.nameZh}</h2>
          {item.aliases.length > 0 && (
            <p className="aliases">
              外号：{item.aliases.map((alias) => alias.text).join("、")}
            </p>
          )}
          <AddButton item={item} included={included} onAdd={onAdd} />
        </div>
      </div>
      <section className="detail-section acquisition-detail">
        <h3>获取方式</h3>
        <AcquisitionSummary item={item} catalog={catalog} />
        <EquipmentWikiLink item={item} />
      </section>
      <APBadges item={item} catalog={catalog} />
      <PrimaryStats item={item} />
      {item.attackProfile?.components &&
        item.attackProfile.components.length > 0 && (
          <details className="detail-section attack-details">
            <summary>
              攻击组件（{item.attackProfile.components.length}）
            </summary>
            <p className="muted">{item.attackProfile.representativeRule}</p>
            {item.attackProfile.components.map((component) => (
              <section className="component-card" key={component.id}>
                <h4>{component.label}</h4>
                <APBadges
                  item={{
                    ...item,
                    attackProfile: {
                      ...item.attackProfile!,
                      components: [component],
                      primaryComponentId: component.id,
                    },
                  }}
                  catalog={catalog}
                />
                <PrimaryStats
                  item={{
                    ...item,
                    handlingStats:
                      component.id === item.attackProfile?.primaryComponentId
                        ? item.handlingStats
                        : undefined,
                    attackProfile: {
                      ...item.attackProfile!,
                      components: [component],
                      primaryComponentId: component.id,
                    },
                  }}
                />
                <AnglePenetrationDetails component={component} />
              </section>
            ))}
          </details>
        )}
      {(item.stats?.armor !== undefined || item.stats?.passive) && (
        <section className="detail-section">
          <h3>护甲参数</h3>
          <dl className="stat-grid">
            {item.stats.armor !== undefined && (
              <div>
                <dt>护甲值</dt>
                <dd>{item.stats.armor}</dd>
              </div>
            )}
            {item.stats.passive && (
              <div>
                <dt>被动</dt>
                <dd>{item.stats.passive}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </section>
  );
}

function PlanTotals({ plan }: { plan: PlanState }) {
  const summary = summarizePlanCosts(
    plan,
    new Map(catalogItems.map((item) => [item.id, item])),
  );
  const itemCount = plan.pendingIds.length + plan.completedIds.length;
  return (
    <div className="plan-totals">
      <span>计划合计</span>
      {summary.warbonds.map((bond) => (
        <div className="plan-total-group" key={bond.warbondId}>
          <span>
            {catalog.warbonds.find((entry) => entry.id === bond.warbondId)
              ?.nameZh ?? bond.warbondId}
          </span>
          <span className="plan-total-threshold">物品价格</span>
          <CurrencyAmountView
            amount={{ type: "medals", amount: bond.itemMedals }}
            catalog={catalog}
          />
          <span className="plan-total-threshold">最高累计前置</span>
          <CurrencyAmountView
            amount={{ type: "medals", amount: bond.highestPageUnlockMedals }}
            catalog={catalog}
          />
        </div>
      ))}
      {(
        Object.entries(summary.currencyTotals) as Array<
          ["requisition-slips" | "super-credits", number]
        >
      )
        .filter(([, value]) => value > 0)
        .map(([type, amount]) => (
          <CurrencyAmountView
            key={type}
            amount={{ type, amount }}
            catalog={catalog}
          />
        ))}
      {itemCount === 0 && <span className="muted">暂无装备</span>}
    </div>
  );
}

function PlanItem({
  item,
  completed,
  onOpen,
  onRemove,
  onComplete,
  onRestore,
  onMove,
}: {
  item: Equipment;
  completed: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onComplete: () => void;
  onRestore: () => void;
  onMove: (delta: number) => void;
}) {
  const openOnKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <li
      className={`plan-item ${completed ? "plan-item--completed" : ""}`}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={openOnKey}
    >
      <ImageWithFallback item={item} compact />
      <div className="plan-item__body">
        <strong>{item.nameZh}</strong>
        <AcquisitionSummary item={item} catalog={catalog} compact />
      </div>
      <div className="plan-item__actions">
        <button
          type="button"
          className="icon-button"
          aria-label={`${completed ? "恢复" : "完成"} ${item.nameZh}`}
          onClick={(event) => {
            event.stopPropagation();
            completed ? onRestore() : onComplete();
          }}
        >
          {completed ? "恢复" : "完成"}
        </button>
        {!completed && (
          <>
            <button
              type="button"
              className="icon-button"
              aria-label={`上移 ${item.nameZh}`}
              onClick={(event) => {
                event.stopPropagation();
                onMove(-1);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`下移 ${item.nameZh}`}
              onClick={(event) => {
                event.stopPropagation();
                onMove(1);
              }}
            >
              ↓
            </button>
          </>
        )}
        <button
          type="button"
          className="icon-button icon-button--danger"
          aria-label={`删除 ${item.nameZh}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </div>
    </li>
  );
}

function PlanPane({
  plan,
  onChange,
  onOpen,
  notice,
  onNotice,
}: {
  plan: PlanState;
  onChange: (action: Parameters<typeof reducePlan>[1]) => void;
  onOpen: (id: string) => void;
  notice?: string;
  onNotice: (message: string) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const completed = plan.completedIds
    .map(findEquipment)
    .filter((item): item is Equipment => Boolean(item));
  const download = () => {
    const blob = new Blob([exportPlan(plan)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "hd2-plan.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const recovery = window.localStorage.getItem(PLAN_RECOVERY_KEY);
  const downloadRecovery = () => {
    if (!recovery) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([recovery], { type: "application/json" }),
    );
    link.download = "hd2-plan-recovery.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importFile = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importPlan(String(reader.result), knownIds);
        savePlanState(window.localStorage, imported);
        window.location.reload();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "导入失败");
      }
    };
    reader.readAsText(file);
    input.value = "";
  };
  return (
    <aside className="plan-pane" aria-labelledby="plan-title">
      <div className="pane-heading">
        <div>
          <p className="section-kicker">解锁计划</p>
          <h2 id="plan-title">准备购买</h2>
        </div>
        <div className="plan-tools">
          <button className="text-button" type="button" onClick={download}>
            导出
          </button>
          {recovery && (
            <button
              className="text-button"
              type="button"
              onClick={downloadRecovery}
            >
              恢复副本
            </button>
          )}
          <label className="text-button" tabIndex={0}>
            导入
            <input
              type="file"
              accept="application/json"
              onChange={importFile}
            />
          </label>
        </div>
      </div>
      <PlanTotals plan={plan} />
      {notice && (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      )}
      <div className="plan-list-wrap">
        <ol className="plan-list">
          {plan.pendingIds.map((id) => {
            const item = findEquipment(id);
            return item ? (
              <PlanItem
                key={id}
                item={item}
                completed={false}
                onOpen={() => onOpen(item.id)}
                onRemove={() => onChange({ type: "remove", id })}
                onComplete={() => onChange({ type: "complete", id })}
                onRestore={() => onChange({ type: "restore", id })}
                onMove={(delta) =>
                  onChange({
                    type: "move",
                    id,
                    toIndex: plan.pendingIds.indexOf(id) + delta,
                  })
                }
              />
            ) : null;
          })}
        </ol>
        {plan.pendingIds.length === 0 && (
          <div className="empty-plan">
            <p>从左侧装备加入计划。</p>
          </div>
        )}
      </div>
      {completed.length > 0 && (
        <details
          className="completed-section"
          open={showCompleted}
          onToggle={(event) =>
            setShowCompleted((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>已完成 · {completed.length}</summary>
          <ol className="plan-list">
            {completed.map((item) => (
              <PlanItem
                key={item.id}
                item={item}
                completed
                onOpen={() => onOpen(item.id)}
                onRemove={() =>
                  onChange({ type: "remove-completed", id: item.id })
                }
                onComplete={() => onChange({ type: "complete", id: item.id })}
                onRestore={() => onChange({ type: "restore", id: item.id })}
                onMove={() => undefined}
              />
            ))}
          </ol>
        </details>
      )}
    </aside>
  );
}

function DataExplanation({ onClose }: { onClose: () => void }) {
  return (
    <div className="info-backdrop" role="presentation" onClick={onClose}>
      <section
        className="info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-explanation-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-panel__head">
          <h2 id="data-explanation-title">数据说明</h2>
          <button className="text-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <p>
          正式搜索只显示通过准入门槛的装备；其余同步结果保留在隔离层，不参与购买计划。
        </p>
        <dl className="audit-list">
          <div>
            <dt>数据源</dt>
            <dd>
              Helldivers Wiki.gg MediaWiki 页面与文件页；Wiki.gg
              是英文事实核心来源，正式中文名优先使用官方游戏简中资源，小黑盒仅补充外号和社区术语。
            </dd>
          </div>
          <div>
            <dt>当前目录</dt>
            <dd>
              {catalogItems.length} 个正式条目，
              {catalog.quarantine?.length ?? 0} 个隔离条目。
            </dd>
          </div>
          <div>
            <dt>同步范围</dt>
            <dd>
              本次中间层发现 {catalog.coverage?.wikiDiscovered ?? 0} 个 Wiki
              Wiki 页面，归一化 {catalog.coverage?.normalized ?? 0} 个装备条目。
            </dd>
          </div>
          <div>
            <dt>素材与许可</dt>
            <dd>
              装备图片和货币图标逐文件记录来源页、文件页、哈希与许可；缺图回退到项目自制
              SVG。Steam 品牌素材与游戏素材不属于 MIT 代码许可。
            </dd>
          </div>
          <div>
            <dt>非官方声明</dt>
            <dd>
              本工具与 Arrowhead、PlayStation、Steam 或 Wiki.gg 无隶属关系。Wiki
              页面可能更新或标记过时，具体字段以数据记录中的 revision 为准。
            </dd>
          </div>
        </dl>
        <p className="muted">
          生成版本：{catalog.meta.dataVersion} · {catalog.meta.generatedAt}
        </p>
      </section>
    </div>
  );
}

function MobileAnchors({ count }: { count: number }) {
  return (
    <nav className="mobile-anchors" aria-label="同页工作区">
      <a href="#lookup-title">速查</a>
      <a href="#plan-title">计划 {count}</a>
    </nav>
  );
}

export function App() {
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [filters, setFilters] = useState<WeaponFilters>(emptyWeaponFilters);
  const [selectedId, setSelectedId] = useItemQuery();
  const [showInfo, setShowInfo] = useState(false);
  const [planLoad] = useState<PlanLoadResult>(() =>
    loadPlanState(window.localStorage, knownIds),
  );
  const [plan, setPlan] = useState<PlanState>(() => planLoad.state);
  const [notice, setNotice] = useState<string | undefined>(
    () => planLoad.error,
  );
  const leftRef = useRef<HTMLDivElement>(null);
  const selectedItem = selectedId ? findEquipment(selectedId) : undefined;
  const includedIds = useMemo(
    () => new Set([...plan.pendingIds, ...plan.completedIds]),
    [plan],
  );
  const results = useMemo(
    () =>
      searchEquipment(catalogItems, query).filter((result) =>
        matchesWeaponFilters(result.item, filters, catalog),
      ),
    [query, filters],
  );
  const setSearch = (next: string) => {
    setQuery(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("q", next);
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
  };
  const changePlan = (action: Parameters<typeof reducePlan>[1]) => {
    const next = reducePlan(plan, action, knownIds);
    setPlan(next);
    savePlanState(window.localStorage, next);
    if (action.type === "add") setNotice("已加入购买计划");
    window.setTimeout(() => setNotice(undefined), 1800);
  };
  useEffect(() => {
    registerSW({ immediate: true });
  }, []);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand-lockup"
          href={import.meta.env.BASE_URL}
          aria-label="HD2 军需簿"
        >
          <span className="brand-mark" aria-hidden="true">
            <img
              src={assetUrl("assets/brand/helldivers2-steam-app-icon.png")}
              alt=""
            />
          </span>
          <span className="brand-title">HD2 军需簿</span>
        </a>
        <button
          className="data-link"
          type="button"
          onClick={() => setShowInfo(true)}
        >
          数据说明
        </button>
      </header>
      <MobileAnchors
        count={plan.pendingIds.length + plan.completedIds.length}
      />
      <main className="workspace">
        <section
          className="lookup-pane"
          ref={leftRef}
          aria-labelledby="lookup-title"
        >
          <div className="pane-heading">
            <div>
              <p className="section-kicker">装备速查</p>
              <h1 id="lookup-title">搜索装备</h1>
            </div>
            <span className="result-count">{results.length}</span>
          </div>
          <label className="search-box">
            <span className="sr-only">搜索装备名称、型号或外号</span>
            <input
              value={query}
              onInput={(event) =>
                setSearch((event.currentTarget as HTMLInputElement).value)
              }
              placeholder="名称、型号或外号"
              type="search"
            />
          </label>
          <FilterPanel filters={filters} onChange={setFilters} />
          {selectedItem ? (
            <EquipmentDetails
              item={selectedItem}
              included={includedIds.has(selectedItem.id)}
              onClose={() => setSelectedId(null)}
              onAdd={() => changePlan({ type: "add", id: selectedItem.id })}
            />
          ) : (
            <div className="result-list" aria-live="polite">
              {results.map((result) => (
                <SearchCard
                  key={result.item.id}
                  result={result}
                  included={includedIds.has(result.item.id)}
                  selected={false}
                  onOpen={() => setSelectedId(result.item.id)}
                  onAdd={() => changePlan({ type: "add", id: result.item.id })}
                />
              ))}
              {results.length === 0 && (
                <div className="empty-state">
                  <p>没有匹配的正式装备。</p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilters(emptyWeaponFilters());
                    }}
                  >
                    清除条件
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        <PlanPane
          plan={plan}
          onChange={changePlan}
          onOpen={setSelectedId}
          notice={notice}
          onNotice={setNotice}
        />
      </main>
      {showInfo && <DataExplanation onClose={() => setShowInfo(false)} />}
    </div>
  );
}
