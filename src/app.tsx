import { useEffect, useMemo, useState } from "preact/hooks";
import {
  aliasesById,
  catalog,
  catalogItems,
  findEquipment,
  itemsById,
} from "./data/catalog";
import type {
  AttackComponent,
  BrowseCategory,
  Equipment,
  PlanState,
} from "./types";
import { resolveAssetUrl } from "./lib/asset-url";
import {
  AcquisitionSummary,
  acquisitionAvailable,
  CurrencyAmount,
} from "./lib/currency";
import {
  apSummaries,
  armorPenetrationText,
  componentLabel,
  demolitionSummaries,
  displayableCombatComponents,
  deploymentTypeLabel,
  passiveLabel,
  PRODUCT_KIND_LABELS,
  weaponTypeLabel,
} from "./lib/display";
import {
  browseCategoryFor,
  searchEquipment,
  type SearchResult,
} from "./lib/search";
import {
  loadPlanState,
  reducePlan,
  savePlanState,
  type PlanAction,
} from "./lib/plan-store";
import { summarizePlanCosts } from "./lib/plan-totals";

const PAGE_SIZE = 30;
const knownIds = catalogItems.map((item) => item.id);
const CATEGORY_META: Array<{
  id: BrowseCategory;
  label: string;
  hint: string;
}> = [
  { id: "weapon", label: "武器", hint: "主武器与副武器" },
  { id: "grenade", label: "手雷", hint: "投掷物" },
  { id: "stratagem", label: "战备", hint: "支援武器与其他战备" },
  { id: "armor", label: "护甲", hint: "身体护甲" },
];

function resultDisplayName(item: Equipment): string | undefined {
  if (!item.model || !item.nameZh.startsWith(item.model)) return item.nameZh;
  return item.nameZh.slice(item.model.length).trim() || undefined;
}

function EquipmentImage({
  item,
  detail = false,
}: {
  item: Equipment;
  detail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div
      className={`image-fallback ${detail ? "image-fallback--detail" : ""}`}
      role="img"
      aria-label={item.image.alt}
    >
      {PRODUCT_KIND_LABELS[item.productKind]}
    </div>
  ) : (
    <img
      className={
        detail ? "equipment-image equipment-image--detail" : "equipment-image"
      }
      src={resolveAssetUrl(item.image.path)}
      alt={item.image.alt}
      loading={detail ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function MetricRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <div className="metric-values">
        {values.slice(0, 3).map((value) => (
          <span key={value}>{value}</span>
        ))}
        {values.length > 3 && <span>+{values.length - 3}</span>}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  included,
  onOpen,
  onAdd,
}: {
  result: SearchResult;
  included: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const item = result.item;
  const displayName = resultDisplayName(item);
  const aliases = aliasesById.get(item.id) ?? [];
  const available = acquisitionAvailable(item);
  return (
    <article className="result-card">
      <button className="result-card__main" type="button" onClick={onOpen}>
        <EquipmentImage item={item} />
        <div className="result-card__body">
          <div className="result-title-row">
            <div className="result-name-line">
              {item.model && <span className="model">{item.model}</span>}
              {displayName && <h2 title={item.nameZh}>{displayName}</h2>}
            </div>
            <span className="type-badge">
              {weaponTypeLabel(item.weaponType) ??
                PRODUCT_KIND_LABELS[item.productKind]}
            </span>
          </div>
          {aliases.length > 0 && (
            <p className="aliases">外号：{aliases.join("、")}</p>
          )}
          <MetricRow label="穿甲" values={apSummaries(item)} />
          <MetricRow label="拆毁" values={demolitionSummaries(item)} />
          <AcquisitionSummary item={item} catalog={catalog} />
        </div>
      </button>
      <button
        className="plan-add"
        type="button"
        disabled={included || !available}
        onClick={onAdd}
      >
        {included
          ? "已在计划"
          : available
            ? "加入计划"
            : item.acquisition.kind === "default"
              ? "默认已解锁"
              : "当前不可购买"}
      </button>
    </article>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) {
  if (value === undefined || value === "") return null;
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ComponentDetails({ component }: { component: AttackComponent }) {
  const fields = component.fields;
  return (
    <div className="component-card">
      <h4>{componentLabel(component)}</h4>
      <dl className="stat-grid">
        <Stat label="伤害" value={fields.standardDamage} />
        <Stat label="耐久伤害" value={fields.durableDamage} />
        <Stat label="DPS" value={fields.dps} />
        <Stat label="穿甲" value={armorPenetrationText(component)} />
        <Stat label="拆毁" value={fields.demolitionForce} />
        <Stat label="硬直" value={fields.stagger} />
        <Stat label="推力" value={fields.push} />
      </dl>
    </div>
  );
}

const DIRECTION_LABELS = { up: "↑", down: "↓", left: "←", right: "→" } as const;

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
  const aliases = aliasesById.get(item.id) ?? [];
  const available = acquisitionAvailable(item);
  const combatComponents = displayableCombatComponents(item);
  return (
    <div
      className="detail-backdrop"
      onPointerDown={(event) =>
        event.currentTarget === event.target && onClose()
      }
    >
      <section
        className="detail-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="detail-title"
      >
        <button
          className="detail-close"
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
        >
          ×
        </button>
        <div className="detail-hero">
          <EquipmentImage item={item} detail />
          <div>
            <p className="model">
              {item.model ? `${item.model} · ` : ""}
              {PRODUCT_KIND_LABELS[item.productKind]}
            </p>
            <h2 id="detail-title">{item.nameZh}</h2>
            <p className="english-name">{item.nameEn}</p>
            {aliases.length > 0 && (
              <p className="aliases">外号：{aliases.join("、")}</p>
            )}
            <p className="detail-type">
              类型：
              {weaponTypeLabel(item.weaponType) ??
                deploymentTypeLabel(item.deployment?.type) ??
                PRODUCT_KIND_LABELS[item.productKind]}
            </p>
          </div>
        </div>
        {combatComponents.length > 0 && (
          <section className="detail-section">
            <h3>攻击参数</h3>
            <div className="component-list">
              {combatComponents.map((component) => (
                <ComponentDetails component={component} key={component.id} />
              ))}
            </div>
          </section>
        )}
        <section className="detail-section">
          <h3>获取方式</h3>
          <AcquisitionSummary item={item} catalog={catalog} />
          <button
            className="plan-add plan-add--detail"
            type="button"
            disabled={included || !available}
            onClick={onAdd}
          >
            {included
              ? "已在计划"
              : available
                ? "加入购买计划"
                : item.acquisition.kind === "default"
                  ? "默认已解锁"
                  : "当前不可购买"}
          </button>
        </section>
        {item.handling && (
          <section className="detail-section">
            <h3>武器属性</h3>
            <dl className="stat-grid">
              <Stat label="弹匣容量" value={item.handling.magazine} />
              <Stat label="备用弹匣" value={item.handling.spareMagazines} />
              <Stat
                label="射速"
                value={
                  item.handling.fireRate === undefined
                    ? undefined
                    : `${item.handling.fireRate} RPM`
                }
              />
              <Stat label="后坐力" value={item.handling.recoil} />
              <Stat
                label="装填时间"
                value={
                  item.handling.reloadSeconds === undefined
                    ? undefined
                    : `${item.handling.reloadSeconds} 秒`
                }
              />
              <Stat
                label="射击模式"
                value={item.handling.firingModes?.join(" / ")}
              />
            </dl>
          </section>
        )}
        {item.armor && (
          <section className="detail-section">
            <h3>护甲属性</h3>
            <dl className="stat-grid">
              <Stat label="级别" value={item.armor.class} />
              <Stat label="护甲值" value={item.armor.rating} />
              <Stat label="速度" value={item.armor.speed} />
              <Stat label="耐力恢复" value={item.armor.staminaRegen} />
              <Stat label="被动" value={passiveLabel(item.armor.passive)} />
            </dl>
          </section>
        )}
        {item.deployment && (
          <section className="detail-section">
            <h3>战备属性</h3>
            <dl className="stat-grid">
              <Stat
                label="战备类型"
                value={deploymentTypeLabel(item.deployment.type)}
              />
              <Stat
                label="呼叫代码"
                value={item.deployment.code
                  ?.map((direction) => DIRECTION_LABELS[direction])
                  .join(" ")}
              />
              <Stat
                label="冷却"
                value={
                  item.deployment.cooldownSeconds === undefined
                    ? undefined
                    : `${item.deployment.cooldownSeconds} 秒`
                }
              />
              <Stat
                label="呼叫时间"
                value={
                  item.deployment.callInSeconds === undefined
                    ? undefined
                    : `${item.deployment.callInSeconds} 秒`
                }
              />
              <Stat label="使用次数" value={item.deployment.uses} />
            </dl>
          </section>
        )}
        {item.wiki?.url && (
          <a
            className="wiki-link"
            href={item.wiki.url}
            target="_blank"
            rel="noreferrer"
          >
            查看 Wiki 资料 ↗
          </a>
        )}
      </section>
    </div>
  );
}

function PlanTotals({ plan }: { plan: PlanState }) {
  const totals = summarizePlanCosts(plan, itemsById, catalog);
  if (!plan.pendingIds.length)
    return <p className="plan-empty">暂无待购装备</p>;
  return (
    <div className="plan-totals">
      {totals.warbonds.map((total) => (
        <div className="plan-total" key={total.warbondId}>
          <strong>
            {catalog.warbonds.find((entry) => entry.id === total.warbondId)
              ?.nameZh ?? total.warbondId}
          </strong>
          <CurrencyAmount
            type="medals"
            amount={total.itemMedals}
            catalog={catalog}
            label="物品"
          />
          {total.highestPageUnlockMedals > 0 && (
            <CurrencyAmount
              type="medals"
              amount={total.highestPageUnlockMedals}
              catalog={catalog}
              label="前置"
            />
          )}
        </div>
      ))}
      {(
        Object.entries(totals.currencyTotals) as Array<
          ["requisition-slips" | "super-credits", number]
        >
      ).map(([type, amount]) => (
        <CurrencyAmount
          key={type}
          type={type}
          amount={amount}
          catalog={catalog}
        />
      ))}
    </div>
  );
}

function PlanPane({
  plan,
  onChange,
  onOpen,
  notice,
}: {
  plan: PlanState;
  onChange: (action: PlanAction) => void;
  onOpen: (id: string) => void;
  notice?: string;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const renderItem = (id: string, completed: boolean) => {
    const item = findEquipment(id);
    if (!item) return null;
    return (
      <li
        className={completed ? "plan-row plan-row--completed" : "plan-row"}
        key={id}
      >
        <button
          className="plan-row__name"
          type="button"
          onClick={() => onOpen(id)}
        >
          {item.nameZh}
        </button>
        <AcquisitionSummary item={item} catalog={catalog} />
        <div className="plan-row__actions">
          <button
            type="button"
            onClick={() =>
              onChange({ type: completed ? "restore" : "complete", id })
            }
          >
            {completed ? "恢复" : "完成"}
          </button>
          <button
            type="button"
            onClick={() => onChange({ type: "remove", id })}
          >
            删除
          </button>
        </div>
      </li>
    );
  };
  return (
    <aside className="plan-pane" aria-labelledby="plan-title">
      <div className="plan-heading">
        <div>
          <p>购买清单</p>
          <h2 id="plan-title">购买计划</h2>
        </div>
        <span>{plan.pendingIds.length}</span>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <PlanTotals plan={plan} />
      <ul className="plan-list">
        {plan.pendingIds.map((id) => renderItem(id, false))}
      </ul>
      {plan.completedIds.length > 0 && (
        <section className="completed-section">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            已完成 {plan.completedIds.length} {showCompleted ? "收起" : "展开"}
          </button>
          {showCompleted && (
            <ul className="plan-list">
              {plan.completedIds.map((id) => renderItem(id, true))}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BrowseCategory | "all" | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planLoad] = useState(() =>
    loadPlanState(window.localStorage, knownIds, catalog.idAliases),
  );
  const [plan, setPlan] = useState(planLoad.state);
  const [notice, setNotice] = useState(planLoad.error);
  const includedIds = useMemo(
    () => new Set([...plan.pendingIds, ...plan.completedIds]),
    [plan],
  );
  const results = useMemo(
    () =>
      searchEquipment(
        catalogItems,
        query,
        category === "all" ? null : category,
      ),
    [query, category],
  );
  const selectedItem = selectedId ? findEquipment(selectedId) : undefined;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setSelectedId(null);
  }, [query, category]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changePlan = (action: PlanAction) => {
    const next = reducePlan(plan, action, knownIds);
    setPlan(next);
    savePlanState(window.localStorage, next);
    setNotice(action.type === "add" ? "已加入购买计划" : undefined);
    if (action.type === "add")
      window.setTimeout(() => setNotice(undefined), 1400);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img
            src={resolveAssetUrl("assets/brand/helldivers2-steam-app-icon.png")}
            alt=""
          />
          <div>
            <strong>HD2 军需簿</strong>
            <span>轻量装备速查</span>
          </div>
        </div>
        <span className="data-version">数据 {catalog.meta.dataVersion}</span>
      </header>
      <main className="workspace">
        <section className="lookup-pane" aria-labelledby="lookup-title">
          <div className="lookup-controls">
            <div className="lookup-heading">
              <div>
                <p>装备速查</p>
                <h1 id="lookup-title">搜索装备</h1>
              </div>
              {(query || category) && <span>{results.length} 条</span>}
            </div>
            <label className="search-box">
              <span className="sr-only">搜索名称、型号、英文名或外号</span>
              <input
                type="search"
                value={query}
                placeholder="名称、型号、英文名或外号"
                onFocus={() => setSelectedId(null)}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            {(query || category) && (
              <div className="active-filters">
                <button
                  className={
                    category === "all" || (category === null && query)
                      ? "active"
                      : ""
                  }
                  type="button"
                  onClick={() => setCategory("all")}
                >
                  全部
                </button>
                {CATEGORY_META.map((entry) => (
                  <button
                    className={category === entry.id ? "active" : ""}
                    type="button"
                    key={entry.id}
                    onClick={() =>
                      setCategory(category === entry.id ? null : entry.id)
                    }
                  >
                    {entry.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                  }}
                >
                  清除
                </button>
              </div>
            )}
          </div>
          <div className="lookup-results">
            {!query && !category ? (
              <div className="category-grid">
                <button type="button" onClick={() => setCategory("all")}>
                  <strong>全部</strong>
                  <span>所有正式装备</span>
                  <em>{catalogItems.length} 件</em>
                </button>
                {CATEGORY_META.map((entry) => {
                  const count = catalogItems.filter(
                    (item) => browseCategoryFor(item.productKind) === entry.id,
                  ).length;
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => setCategory(entry.id)}
                    >
                      <strong>{entry.label}</strong>
                      <span>{entry.hint}</span>
                      <em>{count} 件</em>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="result-list" aria-live="polite">
                {results.slice(0, visibleCount).map((result) => (
                  <ResultCard
                    key={result.item.id}
                    result={result}
                    included={includedIds.has(result.item.id)}
                    onOpen={() => setSelectedId(result.item.id)}
                    onAdd={() =>
                      changePlan({ type: "add", id: result.item.id })
                    }
                  />
                ))}
                {!results.length && (
                  <div className="empty-state">
                    <strong>没有匹配的装备</strong>
                    <p>请尝试完整型号、中文名称、英文名称或社区外号。</p>
                  </div>
                )}
                {visibleCount < results.length && (
                  <button
                    className="show-more"
                    type="button"
                    onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
                  >
                    显示更多（剩余 {results.length - visibleCount}）
                  </button>
                )}
              </div>
            )}
            {selectedItem && (
              <EquipmentDetails
                item={selectedItem}
                included={includedIds.has(selectedItem.id)}
                onClose={() => setSelectedId(null)}
                onAdd={() => changePlan({ type: "add", id: selectedItem.id })}
              />
            )}
          </div>
        </section>
        <PlanPane
          plan={plan}
          onChange={changePlan}
          onOpen={setSelectedId}
          notice={notice}
        />
      </main>
    </div>
  );
}
