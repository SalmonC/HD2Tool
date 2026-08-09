import type { ComponentChildren } from "preact";
import type { Catalog, CurrencyType, Equipment } from "../types";
import { resolveAssetUrl } from "./asset-url";
import { warbondPageUnlock } from "./plan-totals";

export const CURRENCY_LABELS: Record<CurrencyType, string> = {
  medals: "勋章",
  "requisition-slips": "征用点",
  "super-credits": "超级货币",
};

export function CurrencyAmount({
  type,
  amount,
  catalog,
  label,
}: {
  type: CurrencyType;
  amount: number;
  catalog: Catalog;
  label?: string;
}) {
  const definition = catalog.currencies.find((entry) => entry.type === type);
  return (
    <span
      className="currency-amount"
      aria-label={`${label ? `${label} ` : ""}${amount} ${CURRENCY_LABELS[type]}`}
    >
      {label && <span className="currency-prefix">{label}</span>}
      {definition && (
        <img
          className="currency-icon"
          src={resolveAssetUrl(definition.iconAssetPath)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      )}
      <strong>{amount.toLocaleString("zh-CN")}</strong>
      <span className="currency-label">{CURRENCY_LABELS[type]}</span>
    </span>
  );
}

export function acquisitionAvailable(item: Equipment): boolean {
  const acquisition = item.acquisition;
  if (acquisition.kind === "unavailable" || acquisition.kind === "default")
    return false;
  if (acquisition.kind === "superstore")
    return acquisition.status === "rotation";
  if (
    acquisition.kind === "edition" ||
    acquisition.kind === "event" ||
    acquisition.kind === "poi" ||
    acquisition.kind === "other"
  )
    return acquisition.status === "available";
  return true;
}

export function AcquisitionSummary({
  item,
  catalog,
}: {
  item: Equipment;
  catalog: Catalog;
}) {
  const acquisition = item.acquisition;
  let content: ComponentChildren;
  switch (acquisition.kind) {
    case "warbond": {
      const warbond = catalog.warbonds.find(
        (entry) => entry.id === acquisition.warbondId,
      );
      const threshold = warbondPageUnlock(
        catalog,
        acquisition.warbondId,
        acquisition.page,
      );
      content = (
        <>
          <span>
            {warbond?.nameZh ?? acquisition.warbondId}
            {acquisition.page ? ` · 第 ${acquisition.page} 页` : ""}
          </span>
          {acquisition.itemMedals !== null && (
            <CurrencyAmount
              type="medals"
              amount={acquisition.itemMedals}
              catalog={catalog}
              label="价格"
            />
          )}
          {acquisition.page !== null &&
            acquisition.page > 1 &&
            threshold !== null && (
              <CurrencyAmount
                type="medals"
                amount={threshold}
                catalog={catalog}
                label="累计前置"
              />
            )}
        </>
      );
      break;
    }
    case "requisition":
      content = (
        <>
          <span>
            {acquisition.levelRequired === null
              ? "基础战备"
              : `等级 ${acquisition.levelRequired}`}
          </span>
          {acquisition.requisitionPoints !== null && (
            <CurrencyAmount
              type="requisition-slips"
              amount={acquisition.requisitionPoints}
              catalog={catalog}
              label="价格"
            />
          )}
        </>
      );
      break;
    case "default":
      content = <span>默认解锁</span>;
      break;
    case "superstore":
      content = (
        <>
          {acquisition.superCredits !== null && (
            <CurrencyAmount
              type="super-credits"
              amount={acquisition.superCredits}
              catalog={catalog}
              label="超级商店"
            />
          )}
          <span>
            {acquisition.status === "rotation" ? "轮换中" : "当前不可用"}
          </span>
        </>
      );
      break;
    case "edition":
      content = (
        <span>
          {acquisition.editionName}
          {acquisition.status !== "available" ? " · 当前不可用" : ""}
        </span>
      );
      break;
    case "event":
      content = (
        <span>
          {acquisition.eventName} ·{" "}
          {acquisition.status === "available" ? "活动" : "已结束"}
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
      content = (
        <span>
          {acquisition.label}
          {acquisition.status !== "available" ? " · 当前不可用" : ""}
        </span>
      );
      break;
  }
  return <div className="acquisition-summary">{content}</div>;
}
