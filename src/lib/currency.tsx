import type { ComponentChildren } from "preact";
import type {
  Catalog,
  CurrencyAmount,
  CurrencyType,
  Equipment,
} from "../types";
import { resolveAssetUrl as resolveBundledAssetUrl } from "./asset-url";

export const CURRENCY_LABELS: Record<CurrencyType, string> = {
  medals: "勋章",
  "requisition-slips": "征用点",
  "super-credits": "超级货币",
};

export function currencyLabel(type: CurrencyType): string {
  return CURRENCY_LABELS[type];
}

export function currencyAssetPath(
  catalog: Catalog,
  type: CurrencyType,
): string | null {
  return (
    catalog.currencies?.find((currency) => currency.type === type)
      ?.iconAssetPath ?? null
  );
}

export function resolveAssetUrl(
  path: string,
  basePath = import.meta.env.BASE_URL,
  runtimeBase?: string,
): string {
  return resolveBundledAssetUrl(
    path,
    basePath,
    runtimeBase ??
      (typeof document !== "undefined" ? document.baseURI : undefined) ??
      (typeof window !== "undefined" ? window.location.href : undefined),
  );
}

export function CurrencyIcon({
  type,
  catalog,
}: {
  type: CurrencyType;
  catalog: Catalog;
}) {
  const path = currencyAssetPath(catalog, type);
  const resolvedPath = path ? resolveAssetUrl(path) : null;
  return resolvedPath ? (
    <img
      className="currency-icon"
      src={resolvedPath}
      alt=""
      aria-hidden="true"
      onError={(event) => {
        event.currentTarget.style.display = "none";
        event.currentTarget.nextElementSibling?.removeAttribute("hidden");
      }}
    />
  ) : null;
}

export function CurrencyAmountView({
  amount,
  catalog,
  compact = false,
}: {
  amount: CurrencyAmount;
  catalog: Catalog;
  compact?: boolean;
}) {
  const label = currencyLabel(amount.type);
  return (
    <span
      className={`currency-amount ${compact ? "currency-amount--compact" : ""}`}
      title={`${amount.amount} ${label}`}
      aria-label={`${amount.amount} ${label}`}
    >
      <CurrencyIcon type={amount.type} catalog={catalog} />
      <span
        className="currency-fallback"
        hidden={Boolean(currencyAssetPath(catalog, amount.type))}
      >
        {label}
      </span>
      <span className="currency-number">
        {amount.amount.toLocaleString("zh-CN")}
      </span>
      {!compact && <span className="currency-label">{label}</span>}
    </span>
  );
}

export function AcquisitionSummary({
  item,
  catalog,
  compact = false,
}: {
  item: Equipment;
  catalog: Catalog;
  compact?: boolean;
}) {
  const acquisition = item.acquisition;
  const money = (amount: number, type: CurrencyType, label: string) => (
    <span className="purchase-cost">
      <span className="purchase-cost__label">{label}</span>
      <CurrencyAmountView
        amount={{ type, amount }}
        catalog={catalog}
        compact={compact}
      />
    </span>
  );
  let content: ComponentChildren;
  switch (acquisition.kind) {
    case "warbond": {
      const warbond = catalog.warbonds.find(
        (entry) => entry.id === acquisition.warbondId,
      );
      content = (
        <>
          <span>
            {warbond?.nameZh ?? "债券"}
            {acquisition.page ? ` · 第 ${acquisition.page} 页` : ""}
          </span>
          {acquisition.itemMedals !== null &&
            money(acquisition.itemMedals, "medals", "价格")}
          {acquisition.pageUnlockMedals !== null &&
            money(acquisition.pageUnlockMedals, "medals", "累计前置")}
        </>
      );
      break;
    }
    case "requisition":
      content = (
        <>
          {acquisition.levelRequired !== null && (
            <span>等级 {acquisition.levelRequired}</span>
          )}
          {acquisition.requisitionPoints !== null &&
            money(acquisition.requisitionPoints, "requisition-slips", "价格")}
        </>
      );
      break;
    case "default":
      content = <span>默认解锁</span>;
      break;
    case "superstore":
      content = (
        <>
          {acquisition.superCredits !== null &&
            money(acquisition.superCredits, "super-credits", "价格")}
          <span>{acquisition.status === "rotation" ? "轮换" : "暂不可用"}</span>
        </>
      );
      break;
    case "edition":
      content = (
        <>
          <span>{acquisition.editionName}</span>
          {acquisition.price !== null &&
            (acquisition.currencyCode === "USD" ? (
              <span className="purchase-cost">
                <span className="purchase-cost__label">价格</span>
                <span>US$ {acquisition.price.toLocaleString("zh-CN")}</span>
              </span>
            ) : (
              money(
                acquisition.price,
                acquisition.currency ?? "super-credits",
                "价格",
              )
            ))}
        </>
      );
      break;
    case "event":
      content = (
        <span>
          {acquisition.eventName}
          {acquisition.status === "ended" ? " · 已结束" : " · 活动"}
        </span>
      );
      break;
    case "poi":
      content = <span>地图拾取 · {acquisition.location}</span>;
      break;
    case "unavailable":
      content = <span>不可获取 · {acquisition.reason}</span>;
      break;
    case "other":
      content = <span>{acquisition.label}</span>;
      break;
  }
  return (
    <div
      className="acquisition-summary"
      aria-label={`获取方式：${acquisitionSummaryText(item, catalog)}`}
    >
      {content}
    </div>
  );
}

export function acquisitionSummaryText(
  item: Equipment,
  catalog: Catalog,
): string {
  const acquisition = item.acquisition;
  switch (acquisition.kind) {
    case "warbond": {
      const warbond =
        catalog.warbonds.find((entry) => entry.id === acquisition.warbondId)
          ?.nameZh ?? "债券";
      return `${warbond}${acquisition.page ? ` · 第 ${acquisition.page} 页` : ""}${acquisition.itemMedals !== null ? ` · 价格 ${acquisition.itemMedals} 勋章` : ""}${acquisition.pageUnlockMedals !== null ? ` · 累计前置 ${acquisition.pageUnlockMedals} 勋章` : ""}`;
    }
    case "requisition":
      return `${acquisition.levelRequired !== null ? `等级 ${acquisition.levelRequired} · ` : ""}${acquisition.requisitionPoints !== null ? `${acquisition.requisitionPoints} 征用点` : "征用点战备"}`;
    case "default":
      return "默认解锁";
    case "superstore":
      return `${acquisition.superCredits ?? ""} 超级货币 · ${acquisition.status === "rotation" ? "轮换" : "暂不可用"}`;
    case "edition":
      return `${acquisition.editionName} · ${acquisition.price ?? ""} ${acquisition.currencyCode === "USD" ? "美元" : currencyLabel(acquisition.currency ?? "super-credits")}`;
    case "event":
      return `${acquisition.eventName} · ${acquisition.status === "ended" ? "已结束" : "活动"}`;
    case "poi":
      return `地图拾取 · ${acquisition.location}`;
    case "unavailable":
      return `不可获取 · ${acquisition.reason}`;
    case "other":
      return acquisition.label;
  }
}
