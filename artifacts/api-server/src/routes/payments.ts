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
  res.json(payments);
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
  const interestAmount = (borrower.principalAmount * borrower.interestRate) / 100;
  const baseInterestAmount = (borrower.principalAmount * borrower.baseInterestRate) / 100;
  const commissionAmount = (borrower.principalAmount * borrower.commissionRate) / 100;

  const [payment] = await db.insert(paymentsTable).values({
    borrowerId: pathParams.data.borrowerId,
    month,
    year,
    principalAmount: borrower.principalAmount,
    interestRate: borrower.interestRate,
    baseInterestRate: borrower.baseInterestRate,
    commissionRate: borrower.commissionRate,
    interestAmount,
    baseInterestAmount,
    commissionAmount,
    isPaid,
    paidDate: paidDate || null,
    notes: notes || null,
  }).returning();
  res.status(201).json(payment);
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
  res.json(UpdatePaymentResponse.parse(updated));
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
