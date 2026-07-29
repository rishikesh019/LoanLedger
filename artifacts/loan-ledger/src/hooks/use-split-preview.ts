import { useMemo } from "react";
import type { Borrower, Payment } from "@workspace/api-client-react";

export interface SplitPreview {
  outstanding: number;
  fullInterest: number;
  fullBase: number;
  fullCommission: number;
  amountPaid?: number;
  interestPortion?: number;
  baseInterestPortion?: number;
  commissionPortion?: number;
  principalReduction?: number;
  newOutstanding?: number;
  isPartial?: boolean;
  shortfall?: number;
}

/**
 * Computes the interest/principal split for a proposed payment amount in the
 * "Record Payment" dialog. Updates reactively as the user types an amount or
 * changes the period (month/year).
 *
 * Returns null when no borrower is loaded yet.
 * Returns a base preview (no amountPaid breakdown) when the amount field is empty.
 * Returns a full split (with isPartial flag) when a positive amount is entered.
 */
export function useSplitPreview(
  borrower: Borrower | undefined,
  amountPaidWatch: string | undefined,
  selectedMonth: number,
  selectedYear: number,
  payments: Payment[] | undefined,
  currentOutstanding: number,
): SplitPreview | null {
  return useMemo(() => {
    if (!borrower) return null;

    // Find the outstanding principal as of the selected period
    const outstandingForMonth = (() => {
      if (!payments) return currentOutstanding;
      const sorted = [...payments]
        .filter(p => p.year * 12 + p.month < selectedYear * 12 + selectedMonth)
        .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
      for (const p of sorted) {
        if (p.outstandingPrincipal != null) return p.outstandingPrincipal;
      }
      return borrower.principalAmount;
    })();

    const fullInterest =
      Math.round((outstandingForMonth * borrower.interestRate) / 100 * 100) / 100;
    const fullBase =
      Math.round((outstandingForMonth * borrower.baseInterestRate) / 100 * 100) / 100;
    const fullCommission =
      Math.round((outstandingForMonth * borrower.commissionRate) / 100 * 100) / 100;

    const paid = amountPaidWatch ? parseFloat(amountPaidWatch) : null;

    if (paid != null && !isNaN(paid) && paid > 0) {
      if (paid >= fullInterest) {
        const principalReduction = Math.round((paid - fullInterest) * 100) / 100;
        return {
          outstanding: outstandingForMonth,
          fullInterest, fullBase, fullCommission,
          amountPaid: paid,
          interestPortion: fullInterest,
          principalReduction,
          newOutstanding: Math.round((outstandingForMonth - principalReduction) * 100) / 100,
          isPartial: false,
        };
      } else {
        const ratio = paid / fullInterest;
        return {
          outstanding: outstandingForMonth,
          fullInterest, fullBase, fullCommission,
          amountPaid: paid,
          interestPortion: paid,
          baseInterestPortion: Math.round(fullBase * ratio * 100) / 100,
          commissionPortion: Math.round(fullCommission * ratio * 100) / 100,
          principalReduction: 0,
          newOutstanding: outstandingForMonth,
          isPartial: true,
          shortfall: Math.round((fullInterest - paid) * 100) / 100,
        };
      }
    }

    // No amount entered yet — return base breakdown only
    return { outstanding: outstandingForMonth, fullInterest, fullBase, fullCommission };
  }, [borrower, amountPaidWatch, selectedMonth, selectedYear, payments, currentOutstanding]);
}
