import { Router, type IRouter } from "express";
import { eq, and, lt, desc } from "drizzle-orm";
import { db, paymentsTable, borrowersTable } from "@workspace/db";
import {
  ListPaymentsParams,
  CreatePaymentParams,
  CreatePaymentBody,
  UpdatePaymentParams,
  UpdatePaymentBody,
  DeletePaymentParams,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function coercePayment(p: typeof paymentsTable.$inferSelect) {
  return {
    ...p,
    principalAmount: Number(p.principalAmount),
    interestRate: Number(p.interestRate),
    baseInterestRate: Number(p.baseInterestRate),
    commissionRate: Number(p.commissionRate),
    interestAmount: Number(p.interestAmount),
    baseInterestAmount: Number(p.baseInterestAmount),
    commissionAmount: Number(p.commissionAmount),
    amountPaid: p.amountPaid != null ? Number(p.amountPaid) : null,
    principalReduction: Number(p.principalReduction ?? 0),
    outstandingPrincipal: p.outstandingPrincipal != null ? Number(p.outstandingPrincipal) : null,
  };
}

/**
 * Get the current outstanding principal for a borrower.
 * Looks at the most recent payment (by year/month) that has outstandingPrincipal set.
 * Falls back to the borrower's original principalAmount.
 * If beforeMonth/beforeYear is provided, only considers payments strictly before that period.
 */
async function getCurrentOutstanding(
  borrowerId: number,
  originalPrincipal: number,
  beforeYear?: number,
  beforeMonth?: number,
): Promise<number> {
  const all = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.borrowerId, borrowerId))
    .orderBy(desc(paymentsTable.year), desc(paymentsTable.month));

  for (const p of all) {
    // If we need payments before a specific period, skip those at or after it
    if (beforeYear != null && beforeMonth != null) {
      const pCursor = p.year * 12 + p.month;
      const targetCursor = beforeYear * 12 + beforeMonth;
      if (pCursor >= targetCursor) continue;
    }
    if (p.outstandingPrincipal != null) {
      return Number(p.outstandingPrincipal);
    }
  }
  return originalPrincipal;
}

router.get("/borrowers/:borrowerId/payments", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = ListPaymentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const payments = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.borrowerId, params.data.borrowerId))
    .orderBy(paymentsTable.year, paymentsTable.month);
  res.json(payments.map(coercePayment));
});

router.post("/borrowers/:borrowerId/payments", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const pathParams = CreatePaymentParams.safeParse(req.params);
  if (!pathParams.success) { res.status(400).json({ error: pathParams.error.message }); return; }

  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, pathParams.data.borrowerId));
  if (!borrower) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { month, year, isPaid = false, paidDate, notes } = parsed.data;
  const amountPaid = (req.body.amountPaid != null && req.body.amountPaid !== "") ? Number(req.body.amountPaid) : null;

  const originalPrincipal = Number(borrower.principalAmount);
  const rate = Number(borrower.interestRate);
  const baseRate = Number(borrower.baseInterestRate);
  const commissionRate = Number(borrower.commissionRate);

  // Use outstanding principal from the most recent previous payment
  const outstandingBefore = await getCurrentOutstanding(pathParams.data.borrowerId, originalPrincipal, year, month);

  // Interest is calculated on the current outstanding, not the original principal
  const fullInterest = round2((outstandingBefore * rate) / 100);
  const fullBaseInterest = round2((outstandingBefore * baseRate) / 100);
  const fullCommission = round2((outstandingBefore * commissionRate) / 100);

  // Reducing balance calculation
  let principalReduction = 0;
  let outstandingAfter: number | null = null;
  let actualInterestAmount = fullInterest;
  let actualBaseInterest = fullBaseInterest;
  let actualCommission = fullCommission;
  let finalIsPaid = isPaid;

  if (amountPaid != null && amountPaid > 0) {
    finalIsPaid = true; // Recording an actual amount implies payment was made
    if (amountPaid >= fullInterest) {
      // Full interest covered + possible principal reduction
      principalReduction = round2(amountPaid - fullInterest);
      outstandingAfter = round2(outstandingBefore - principalReduction);
      // Interest amounts are the full calculated amounts
      actualInterestAmount = fullInterest;
      actualBaseInterest = fullBaseInterest;
      actualCommission = fullCommission;
    } else {
      // Partial payment — only covers part of the interest
      const ratio = amountPaid / fullInterest;
      actualInterestAmount = round2(amountPaid);
      actualBaseInterest = round2(fullBaseInterest * ratio);
      actualCommission = round2(fullCommission * ratio);
      principalReduction = 0;
      outstandingAfter = outstandingBefore; // No principal reduction on partial payment
    }
  } else if (finalIsPaid) {
    // Marked paid without a specific amount — treat as full interest-only payment
    outstandingAfter = outstandingBefore; // No principal change
  }

  const [payment] = await db.insert(paymentsTable).values({
    borrowerId: pathParams.data.borrowerId,
    month,
    year,
    principalAmount: String(outstandingBefore),
    interestRate: String(rate),
    baseInterestRate: String(baseRate),
    commissionRate: String(commissionRate),
    interestAmount: String(actualInterestAmount),
    baseInterestAmount: String(actualBaseInterest),
    commissionAmount: String(actualCommission),
    amountPaid: amountPaid != null ? String(amountPaid) : null,
    principalReduction: String(principalReduction),
    outstandingPrincipal: outstandingAfter != null ? String(outstandingAfter) : null,
    isPaid: finalIsPaid,
    paidDate: paidDate
      ? (paidDate instanceof Date ? paidDate.toISOString().split("T")[0] : String(paidDate))
      : null,
    notes: notes || null,
  }).returning();

  res.status(201).json(coercePayment(payment));
});

// Bulk payment generation — creates entries for a month range (interest-only, no principal reduction)
router.post("/borrowers/:borrowerId/payments/bulk", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const pathParams = CreatePaymentParams.safeParse(req.params);
  if (!pathParams.success) { res.status(400).json({ error: pathParams.error.message }); return; }

  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, pathParams.data.borrowerId));
  if (!borrower) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const { fromMonth, fromYear, toMonth, toYear, isPaid = false, paidDate, notes } = req.body as {
    fromMonth: number; fromYear: number; toMonth: number; toYear: number;
    isPaid?: boolean; paidDate?: string; notes?: string;
  };

  if (!fromMonth || !fromYear || !toMonth || !toYear) {
    res.status(400).json({ error: "fromMonth, fromYear, toMonth, toYear are required" });
    return;
  }

  const from = fromYear * 12 + (fromMonth - 1);
  const to = toYear * 12 + (toMonth - 1);
  if (from > to) { res.status(400).json({ error: "From date must be before or equal to To date" }); return; }
  if (to - from > 119) { res.status(400).json({ error: "Range cannot exceed 120 months" }); return; }

  const existing = await db.select().from(paymentsTable).where(eq(paymentsTable.borrowerId, pathParams.data.borrowerId));
  const existingSet = new Set(existing.map(p => `${p.year}-${p.month}`));

  const originalPrincipal = Number(borrower.principalAmount);
  const rate = Number(borrower.interestRate);
  const baseRate = Number(borrower.baseInterestRate);
  const commissionRate = Number(borrower.commissionRate);

  const toInsert: typeof paymentsTable.$inferInsert[] = [];
  for (let cursor = from; cursor <= to; cursor++) {
    const y = Math.floor(cursor / 12);
    const m = (cursor % 12) + 1;
    if (existingSet.has(`${y}-${m}`)) continue;

    // Use current outstanding for each month in the range
    const outstanding = await getCurrentOutstanding(pathParams.data.borrowerId, originalPrincipal, y, m);
    const interestAmount = round2((outstanding * rate) / 100);
    const baseInterestAmount = round2((outstanding * baseRate) / 100);
    const commissionAmount = round2((outstanding * commissionRate) / 100);

    toInsert.push({
      borrowerId: pathParams.data.borrowerId,
      month: m,
      year: y,
      principalAmount: String(outstanding),
      interestRate: String(rate),
      baseInterestRate: String(baseRate),
      commissionRate: String(commissionRate),
      interestAmount: String(interestAmount),
      baseInterestAmount: String(baseInterestAmount),
      commissionAmount: String(commissionAmount),
      principalReduction: "0",
      isPaid,
      paidDate: paidDate || null,
      notes: notes || null,
    });
  }

  const skipped = (to - from + 1) - toInsert.length;
  if (toInsert.length === 0) {
    res.json({ created: 0, skipped, payments: [] });
    return;
  }

  const created = await db.insert(paymentsTable).values(toInsert).returning();
  res.status(201).json({ created: created.length, skipped, payments: created.map(coercePayment) });
});

router.patch("/borrowers/:borrowerId/payments/:paymentId", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = UpdatePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData = {
    ...parsed.data,
    paidDate: parsed.data.paidDate instanceof Date
      ? parsed.data.paidDate.toISOString().split("T")[0]
      : parsed.data.paidDate,
  };
  const [updated] = await db.update(paymentsTable)
    .set(updateData)
    .where(and(eq(paymentsTable.id, params.data.paymentId), eq(paymentsTable.borrowerId, params.data.borrowerId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(coercePayment(updated));
});

router.delete("/borrowers/:borrowerId/payments/:paymentId", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = DeletePaymentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(paymentsTable).where(
    and(eq(paymentsTable.id, params.data.paymentId), eq(paymentsTable.borrowerId, params.data.borrowerId))
  );
  res.sendStatus(204);
});

export default router;
