import { useMemo } from "react";
import type { Borrower, Payment } from "@workspace/api-client-react";

export interface ScheduleRow {
  year: number;
  month: number;
  cursor: number;
  existing: Payment | undefined;
  outstanding: number;
  interestDue: number;
  commissionDue: number;
  isUpcoming: boolean;
  isOverdue: boolean;
}

/**
 * Computes a full repayment schedule for a borrower from their loan start date
 * through to either their tenure end, end date, or the current month —
 * whichever is latest. Reconciles schedule rows against existing payment records.
 */
export function useSchedule(
  borrower: Borrower | undefined,
  payments: Payment[] | undefined,
): ScheduleRow[] {
  return useMemo(() => {
    if (!borrower) return [];

    const now = new Date();
    // Dates arrive as strings over JSON despite the TypeScript type saying Date
    const start = new Date(borrower.startDate as unknown as string);
    const startCursor = start.getFullYear() * 12 + start.getMonth();
    const nowCursor = now.getFullYear() * 12 + now.getMonth();

    let endCursor = nowCursor;
    if (borrower.tenure) {
      endCursor = Math.max(endCursor, startCursor + borrower.tenure - 1);
    }
    if (borrower.endDate) {
      const ed = new Date(borrower.endDate as unknown as string);
      endCursor = Math.max(endCursor, ed.getFullYear() * 12 + ed.getMonth());
    }

    const paymentMap = new Map(
      (payments ?? []).map(p => [`${p.year}-${p.month}`, p]),
    );

    let runningOutstanding = borrower.principalAmount;

    return Array.from({ length: endCursor - startCursor + 1 }, (_, i) => {
      const cursor = startCursor + i;
      const year = Math.floor(cursor / 12);
      const month = (cursor % 12) + 1;
      const existing = paymentMap.get(`${year}-${month}`);
      const isUpcoming = cursor > nowCursor;
      const isOverdue =
        !isUpcoming && cursor < nowCursor && (!existing || (!existing.isPaid && !existing.isMissed));

      const outstanding = existing?.principalAmount ?? runningOutstanding;
      const interestDue = existing?.interestAmount ??
        Math.round((outstanding * borrower.interestRate) / 100 * 100) / 100;
      const commissionDue = existing?.commissionAmount ??
        Math.round((outstanding * borrower.commissionRate) / 100 * 100) / 100;

      if (existing?.outstandingPrincipal != null) {
        runningOutstanding = existing.outstandingPrincipal;
      }

      return { year, month, cursor, existing, outstanding, interestDue, commissionDue, isUpcoming, isOverdue };
    });
  }, [borrower, payments]);
}
