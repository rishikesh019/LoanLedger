import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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

  // Admin sees all active borrowers; regular users see only their own
  const conditions: ReturnType<typeof eq>[] = [eq(borrowersTable.status, "active")];
  if (appUser.role !== "admin") {
    conditions.push(eq(borrowersTable.userId, appUser.id));
  }

  const borrowers = await db.select().from(borrowersTable).where(and(...conditions));

  const items = await Promise.all(borrowers.map(async (b) => {
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.borrowerId, b.id));

    // Overdue = unpaid payments in past months
    const overdueCount = payments.filter(p =>
      !p.isPaid && (p.year * 12 + (p.month - 1) < currentYear * 12 + (currentMonth - 1))
    ).length;

    // Current outstanding principal
    const sortedByDate = [...payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
    let outstandingPrincipal = Number(b.principalAmount);
    for (const p of sortedByDate) {
      if (p.outstandingPrincipal != null) {
        outstandingPrincipal = Number(p.outstandingPrincipal);
        break;
      }
    }

    const interestDue = round2((outstandingPrincipal * Number(b.interestRate)) / 100);

    // Selected month payment record
    const currentPayment = payments.find(p => p.year === currentYear && p.month === currentMonth);

    return {
      borrowerId: b.id,
      borrowerName: b.name,
      phone: b.phone,
      startDate: b.startDate ?? "",
      principalAmount: Number(b.principalAmount),
      outstandingPrincipal,
      interestRate: Number(b.interestRate),
      interestDue,
      overdueCount,
      hasPaymentRecord: !!currentPayment,
      paymentId: currentPayment?.id ?? null,
      isPaid: currentPayment?.isPaid ?? false,
      amountPaid: currentPayment?.amountPaid != null ? Number(currentPayment.amountPaid) : null,
    };
  }));

  res.json(items);
});

export default router;
