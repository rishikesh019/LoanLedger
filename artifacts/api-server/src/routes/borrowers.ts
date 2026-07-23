import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, borrowersTable, paymentsTable, usersTable } from "@workspace/db";
import {
  ListBorrowersQueryParams,
  CreateBorrowerBody,
  GetBorrowerParams,
  GetBorrowerResponse,
  UpdateBorrowerParams,
  UpdateBorrowerBody,
  UpdateBorrowerResponse,
  DeleteBorrowerParams,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/auth";

const router: IRouter = Router();

const BASE_INTEREST_RATE = 10;

/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Coerce numeric/string fields from DB to JS numbers */
function coerceBorrower(b: any) {
  return {
    ...b,
    principalAmount: Number(b.principalAmount),
    interestRate: Number(b.interestRate),
    baseInterestRate: Number(b.baseInterestRate),
    commissionRate: Number(b.commissionRate),
  };
}

async function enrichBorrower(rawBorrower: any) {
  const b = coerceBorrower(rawBorrower);
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.borrowerId, b.id));
  const totalInterestEarned = payments.reduce((sum, p) => sum + (p.isPaid ? Number(p.interestAmount) : 0), 0);
  const totalCommissionEarned = payments.reduce((sum, p) => sum + (p.isPaid ? Number(p.commissionAmount) : 0), 0);
  const now = new Date();
  const start = new Date(b.startDate);
  const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  // Count unpaid payments whose period is already in the past
  const currentYearMonth = now.getFullYear() * 12 + now.getMonth(); // currentMonth is 0-indexed here
  const overdueCount = payments.filter(p =>
    !p.isPaid && (p.year * 12 + (p.month - 1) < currentYearMonth)
  ).length;

  return {
    ...b,
    totalInterestEarned: round2(totalInterestEarned),
    totalCommissionEarned: round2(totalCommissionEarned),
    monthsElapsed: Math.max(0, monthsElapsed),
    overdueCount,
  };
}

router.get("/borrowers", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const queryParams = ListBorrowersQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { status, search } = queryParams.data;

  const conditions = [];
  // Always scope to the requesting user — borrowers are private per user, even for admins
  conditions.push(eq(borrowersTable.userId, appUser.id));
  if (status) {
    conditions.push(eq(borrowersTable.status, status));
  }

  let borrowers = await db
    .select({
      id: borrowersTable.id,
      userId: borrowersTable.userId,
      name: borrowersTable.name,
      address: borrowersTable.address,
      phone: borrowersTable.phone,
      email: borrowersTable.email,
      principalAmount: borrowersTable.principalAmount,
      interestRate: borrowersTable.interestRate,
      baseInterestRate: borrowersTable.baseInterestRate,
      commissionRate: borrowersTable.commissionRate,
      tenure: borrowersTable.tenure,
      startDate: borrowersTable.startDate,
      endDate: borrowersTable.endDate,
      status: borrowersTable.status,
      notes: borrowersTable.notes,
      createdAt: borrowersTable.createdAt,
      updatedAt: borrowersTable.updatedAt,
      userName: usersTable.name,
    })
    .from(borrowersTable)
    .leftJoin(usersTable, eq(borrowersTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(borrowersTable.createdAt);

  if (search) {
    const s = search.toLowerCase();
    borrowers = borrowers.filter(b =>
      b.name.toLowerCase().includes(s) ||
      b.address.toLowerCase().includes(s) ||
      (b.phone && b.phone.toLowerCase().includes(s)) ||
      (b.email && b.email.toLowerCase().includes(s))
    );
  }

  const enriched = await Promise.all(borrowers.map(b => enrichBorrower(b)));
  res.json(enriched);
});

router.post("/borrowers", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const parsed = CreateBorrowerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const interestRate = Number(parsed.data.interestRate ?? BASE_INTEREST_RATE);
  const commissionRate = round2(Math.max(0, interestRate - BASE_INTEREST_RATE));
  const [borrower] = await db.insert(borrowersTable).values({
    ...parsed.data,
    userId: appUser.id,
    interestRate: String(interestRate),
    baseInterestRate: String(BASE_INTEREST_RATE),
    commissionRate: String(commissionRate),
    status: "active",
  }).returning();
  const enriched = await enrichBorrower(borrower);
  res.status(201).json(enriched);
});

router.get("/borrowers/:id", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = GetBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [borrower] = await db
    .select({
      id: borrowersTable.id,
      userId: borrowersTable.userId,
      name: borrowersTable.name,
      address: borrowersTable.address,
      phone: borrowersTable.phone,
      email: borrowersTable.email,
      principalAmount: borrowersTable.principalAmount,
      interestRate: borrowersTable.interestRate,
      baseInterestRate: borrowersTable.baseInterestRate,
      commissionRate: borrowersTable.commissionRate,
      tenure: borrowersTable.tenure,
      startDate: borrowersTable.startDate,
      endDate: borrowersTable.endDate,
      status: borrowersTable.status,
      notes: borrowersTable.notes,
      createdAt: borrowersTable.createdAt,
      updatedAt: borrowersTable.updatedAt,
      userName: usersTable.name,
    })
    .from(borrowersTable)
    .leftJoin(usersTable, eq(borrowersTable.userId, usersTable.id))
    .where(eq(borrowersTable.id, params.data.id));

  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (borrower.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const enriched = await enrichBorrower(borrower);
  res.json(enriched);
});

router.patch("/borrowers/:id", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = UpdateBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (existing.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdateBorrowerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Recalculate commission if interest rate changes
  const updates: any = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.interestRate !== undefined) {
    const newRate = Number(parsed.data.interestRate);
    updates.interestRate = String(newRate);
    updates.commissionRate = String(round2(Math.max(0, newRate - BASE_INTEREST_RATE)));
  }
  const [updated] = await db.update(borrowersTable)
    .set(updates)
    .where(eq(borrowersTable.id, params.data.id))
    .returning();
  const enriched = await enrichBorrower(updated);
  res.json(enriched);
});

router.delete("/borrowers/:id", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = DeleteBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  if (existing.userId !== appUser.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(paymentsTable).where(eq(paymentsTable.borrowerId, params.data.id));
  await db.delete(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
