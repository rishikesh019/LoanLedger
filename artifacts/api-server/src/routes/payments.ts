import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, paymentsTable, borrowersTable } from "@workspace/db";
import {
  ListPaymentsParams,
  CreatePaymentParams,
  CreatePaymentBody,
  UpdatePaymentParams,
  UpdatePaymentBody,
  UpdatePaymentResponse,
  DeletePaymentParams,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

/** Round to 2 decimal places to avoid floating-point noise in calculations */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

router.get("/borrowers/:borrowerId/payments", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = ListPaymentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const payments = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.borrowerId, params.data.borrowerId))
    .orderBy(paymentsTable.year, paymentsTable.month);
  // Coerce numeric columns to numbers for the client
  res.json(payments.map(p => ({
    ...p,
    principalAmount: Number(p.principalAmount),
    interestRate: Number(p.interestRate),
    baseInterestRate: Number(p.baseInterestRate),
    commissionRate: Number(p.commissionRate),
    interestAmount: Number(p.interestAmount),
    baseInterestAmount: Number(p.baseInterestAmount),
    commissionAmount: Number(p.commissionAmount),
  })));
});

router.post("/borrowers/:borrowerId/payments", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const pathParams = CreatePaymentParams.safeParse(req.params);
  if (!pathParams.success) {
    res.status(400).json({ error: pathParams.error.message });
    return;
  }
  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, pathParams.data.borrowerId));
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { month, year, isPaid = false, paidDate, notes } = parsed.data;

  // Numeric columns come back as strings — cast before arithmetic
  const principal = Number(borrower.principalAmount);
  const rate = Number(borrower.interestRate);
  const baseRate = Number(borrower.baseInterestRate);
  const commissionRate = Number(borrower.commissionRate);

  const interestAmount = round2((principal * rate) / 100);
  const baseInterestAmount = round2((principal * baseRate) / 100);
  const commissionAmount = round2((principal * commissionRate) / 100);

  const [payment] = await db.insert(paymentsTable).values({
    borrowerId: pathParams.data.borrowerId,
    month,
    year,
    principalAmount: String(principal),
    interestRate: String(rate),
    baseInterestRate: String(baseRate),
    commissionRate: String(commissionRate),
    interestAmount: String(interestAmount),
    baseInterestAmount: String(baseInterestAmount),
    commissionAmount: String(commissionAmount),
    isPaid,
    paidDate: paidDate || null,
    notes: notes || null,
  }).returning();

  res.status(201).json({
    ...payment,
    principalAmount: Number(payment.principalAmount),
    interestRate: Number(payment.interestRate),
    baseInterestRate: Number(payment.baseInterestRate),
    commissionRate: Number(payment.commissionRate),
    interestAmount: Number(payment.interestAmount),
    baseInterestAmount: Number(payment.baseInterestAmount),
    commissionAmount: Number(payment.commissionAmount),
  });
});

router.patch("/borrowers/:borrowerId/payments/:paymentId", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = UpdatePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db.update(paymentsTable)
    .set(parsed.data)
    .where(and(eq(paymentsTable.id, params.data.paymentId), eq(paymentsTable.borrowerId, params.data.borrowerId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json({
    ...updated,
    principalAmount: Number(updated.principalAmount),
    interestRate: Number(updated.interestRate),
    baseInterestRate: Number(updated.baseInterestRate),
    commissionRate: Number(updated.commissionRate),
    interestAmount: Number(updated.interestAmount),
    baseInterestAmount: Number(updated.baseInterestAmount),
    commissionAmount: Number(updated.commissionAmount),
  });
});

router.delete("/borrowers/:borrowerId/payments/:paymentId", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = DeletePaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [borrower] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.borrowerId));
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (appUser.role !== "admin" && borrower.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(paymentsTable).where(
    and(eq(paymentsTable.id, params.data.paymentId), eq(paymentsTable.borrowerId, params.data.borrowerId))
  );
  res.sendStatus(204);
});

export default router;
