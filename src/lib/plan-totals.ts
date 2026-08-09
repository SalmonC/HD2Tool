import type { Catalog, CurrencyType, Equipment, PlanState } from "../types";

export interface WarbondPlanTotal {
  warbondId: string;
  itemMedals: number;
  highestPageUnlockMedals: number;
}

export interface PlanCostSummary {
  warbonds: WarbondPlanTotal[];
  currencyTotals: Partial<Record<CurrencyType, number>>;
}

export function warbondPageUnlock(
  catalog: Catalog,
  warbondId: string,
  page: number | null,
): number | null {
  if (page === null) return null;
  return (
    catalog.warbonds
      .find((warbond) => warbond.id === warbondId)
      ?.pages.find((entry) => entry.page === page)?.cumulativeMedals ?? null
  );
}

export function summarizePlanCosts(
  plan: PlanState,
  itemsById: ReadonlyMap<string, Equipment>,
  catalog: Catalog,
): PlanCostSummary {
  const warbonds = new Map<string, WarbondPlanTotal>();
  const currencyTotals: Partial<Record<CurrencyType, number>> = {};
  for (const id of plan.pendingIds) {
    const acquisition = itemsById.get(id)?.acquisition;
    if (!acquisition) continue;
    if (acquisition.kind === "warbond") {
      const current = warbonds.get(acquisition.warbondId) ?? {
        warbondId: acquisition.warbondId,
        itemMedals: 0,
        highestPageUnlockMedals: 0,
      };
      current.itemMedals += acquisition.itemMedals ?? 0;
      current.highestPageUnlockMedals = Math.max(
        current.highestPageUnlockMedals,
        warbondPageUnlock(catalog, acquisition.warbondId, acquisition.page) ??
          0,
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
