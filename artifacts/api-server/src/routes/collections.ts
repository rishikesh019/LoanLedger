import { Router, type IRouter } from "express";
import { eq, and, lte, type SQL } from "drizzle-orm";
import { db, borrowersTable, paymentsTable } from "@workspace/db";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

router.get("/collections/current-month", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const now = new Date();
  const requestedYear = Number(req.query.year);
  const requestedMonth = Number(req.query.month);
  const currentYear = Number.isInteger(requestedYear) && requestedYear >= 1970 && requestedYear <= 9999
    ? requestedYear
    : now.getFullYear();
  const currentMonth = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
    ? requestedMonth
    : now.getMonth() + 1;

  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const monthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Future loans stay hidden. Loans already closed by this month remain in the
  // response only so the UI can report them separately from collectible capital.
  const conditions: SQL[] = [
    lte(borrowersTable.startDate, monthEnd),
  ];
  if (appUser.role !== "admin") {
    conditions.push(eq(borrowersTable.userId, appUser.id));
  }

  const borrowers = await db.select().from(borrowersTable).where(and(...conditions));

  const items = await Promise.all(borrowers.map(async (b) => {
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.borrowerId, b.id));
    const selectedCursor = currentYear * 12 + (currentMonth - 1);
    const currentPayments = payments
      .filter(p => p.year === currentYear && p.month === currentMonth)
      .sort((a, b) => a.id - b.id);
    const currentPayment = currentPayments.at(-1);
    const normalizedEndDate = b.endDate?.slice(0, 10) ?? null;
    const closedBeforeSelectedMonth = b.status === "closed"
      && normalizedEndDate != null
      && normalizedEndDate < monthStart;

    // Overdue = unpaid payments in past months
    const overdueCount = payments.filter(p =>
      !p.isPaid && (p.year * 12 + (p.month - 1) < currentYear * 12 + (currentMonth - 1))
    ).length;

    // Principal at the start of the selected month, not today's balance.
    const latestPrevious = [...payments]
      .filter(p => p.year * 12 + (p.month - 1) < selectedCursor)
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
      .find(p => p.outstandingPrincipal != null);
    const latestThroughSelected = [...payments]
      .filter(p => p.year * 12 + (p.month - 1) <= selectedCursor)
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
      .find(p => p.outstandingPrincipal != null);
    const outstandingPrincipal = currentPayment
      ? Number(currentPayment.principalAmount)
      : latestPrevious?.outstandingPrincipal != null
        ? Number(latestPrevious.outstandingPrincipal)
        : Number(b.principalAmount);
    const periodEndOutstandingPrincipal = latestThroughSelected?.outstandingPrincipal != null
      ? Number(latestThroughSelected.outstandingPrincipal)
      : outstandingPrincipal;

    const interestDue = round2((outstandingPrincipal * Number(b.interestRate)) / 100);
    const scheduledPrincipal = b.tenure && b.tenure > 0
      ? round2(Number(b.principalAmount) / b.tenure)
      : 0;
    const emiAmount = currentPayment?.isMissed && currentPayment.capitalizedAmount != null
      ? Number(currentPayment.capitalizedAmount)
      : round2(interestDue + scheduledPrincipal);
    const isClosed = b.status === "closed" && (!normalizedEndDate || normalizedEndDate <= monthEnd);
    const interestCollected = closedBeforeSelectedMonth
      ? 0
      : round2(currentPayments.reduce((total, payment) => {
          if (!payment.isPaid) return total;

          const recordedInterest = Number(payment.interestAmount);
          const amountPaid = payment.amountPaid != null ? Number(payment.amountPaid) : recordedInterest;
          const principalReduction = payment.principalReduction != null
            ? Number(payment.principalReduction)
            : Math.max(0, amountPaid - recordedInterest);
          const isClosurePayment = isClosed && principalReduction > 0;

          return isClosurePayment
            ? total
            : total + Math.min(amountPaid, recordedInterest);
        }, 0));

    return {
      borrowerId: b.id,
      borrowerName: b.name,
      phone: b.phone,
      startDate: b.startDate ?? "",
      principalAmount: Number(b.principalAmount),
      outstandingPrincipal,
      periodEndOutstandingPrincipal,
      interestRate: Number(b.interestRate),
      interestDue,
      interestCollected,
      scheduledPrincipal,
      emiAmount,
      isClosed,
      overdueCount,
      hasPaymentRecord: !!currentPayment,
      paymentId: currentPayment?.id ?? null,
      isPaid: currentPayment?.isPaid ?? false,
      isMissed: currentPayment?.isMissed ?? false,
      capitalizedAmount: currentPayment?.capitalizedAmount != null ? Number(currentPayment.capitalizedAmount) : 0,
      amountPaid: currentPayment?.amountPaid != null ? Number(currentPayment.amountPaid) : null,
    };
  }));

  res.json(items);
});

export default router;
