import type { Equipment, PlanState, CurrencyType } from "../types";

export interface WarbondPlanTotal {
  warbondId: string;
  itemMedals: number;
  highestPageUnlockMedals: number;
}

export interface PlanCostSummary {
  warbonds: WarbondPlanTotal[];
  currencyTotals: Partial<Record<CurrencyType, number>>;
}

/**
 * Page thresholds are shared prerequisites. They are intentionally kept
 * separate from the sum of item prices because adding both would double count
 * medals and would imply an unlock path we do not model.
 */
export function summarizePlanCosts(
  plan: PlanState,
  itemsById: ReadonlyMap<string, Equipment>,
): PlanCostSummary {
  const warbonds = new Map<string, WarbondPlanTotal>();
  const currencyTotals: Partial<Record<CurrencyType, number>> = {};
  for (const id of plan.pendingIds) {
    const item = itemsById.get(id);
    if (!item) continue;
    const acquisition = item.acquisition;
    if (acquisition.kind === "warbond") {
      const current = warbonds.get(acquisition.warbondId) ?? {
        warbondId: acquisition.warbondId,
        itemMedals: 0,
        highestPageUnlockMedals: 0,
      };
      current.itemMedals += acquisition.itemMedals ?? 0;
      current.highestPageUnlockMedals = Math.max(
        current.highestPageUnlockMedals,
        acquisition.pageUnlockMedals ?? 0,
      );
      warbonds.set(acquisition.warbondId, current);
    } else if (
      acquisition.kind === "requisition" &&
      acquisition.requisitionPoints !== null
    ) {
      currencyTotals["requisition-slips"] =
        (currencyTotals["requisition-slips"] ?? 0) +
        acquisition.requisitionPoints;
    } else if (
      acquisition.kind === "superstore" &&
      acquisition.superCredits !== null
    ) {
      currencyTotals["super-credits"] =
        (currencyTotals["super-credits"] ?? 0) + acquisition.superCredits;
    } else if (
      acquisition.kind === "edition" &&
      acquisition.price !== null &&
      acquisition.currency
    ) {
      currencyTotals[acquisition.currency] =
        (currencyTotals[acquisition.currency] ?? 0) + acquisition.price;
    }
  }
  return {
    warbonds: [...warbonds.values()].sort((a, b) =>
      a.warbondId.localeCompare(b.warbondId),
    ),
    currencyTotals,
  };
}
