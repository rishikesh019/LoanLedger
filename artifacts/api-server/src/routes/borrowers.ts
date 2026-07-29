import { Router, type IRouter } from "express";
import { eq, and, or, ilike, sql, isNull, inArray } from "drizzle-orm";
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
  ListBorrowerSubAccountsParams,
  CreateBorrowerSubAccountParams,
  CreateBorrowerSubAccountBody,
  MergeBorrowerSubAccountsParams,
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

  // Compute outstanding principal from the most recent payment that recorded it
  const sortedPayments = [...payments].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  let outstandingPrincipal: number = b.principalAmount;
  for (const p of sortedPayments) {
    if (p.outstandingPrincipal != null) {
      outstandingPrincipal = round2(Number(p.outstandingPrincipal));
      break;
    }
  }

  return {
    ...b,
    totalInterestEarned: round2(totalInterestEarned),
    totalCommissionEarned: round2(totalCommissionEarned),
    monthsElapsed: Math.max(0, monthsElapsed),
    overdueCount,
    outstandingPrincipal,
  };
}

router.get("/borrowers", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const queryParams = ListBorrowersQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { status, search, month } = queryParams.data;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const conditions = [];
  // Always exclude sub-accounts from the top-level list
  conditions.push(isNull(borrowersTable.parentId));
  // Admin sees all borrowers; regular users only see their own
  if (appUser.role !== "admin") {
    conditions.push(eq(borrowersTable.userId, appUser.id));
  }
  if (status) {
    conditions.push(eq(borrowersTable.status, status));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(borrowersTable.name, pattern),
      ilike(borrowersTable.address, pattern),
      ilike(borrowersTable.phone, pattern),
      ilike(borrowersTable.email, pattern),
    ));
  }
  if (month) {
    // month is "YYYY-MM"; startDate is stored as text "YYYY-MM-DD"
    conditions.push(sql`${borrowersTable.startDate} LIKE ${month + "%"}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count for pagination
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(borrowersTable)
    .where(where);

  // Paginated data
  const rawBorrowers = await db
    .select({
      id: borrowersTable.id,
      userId: borrowersTable.userId,
      parentId: borrowersTable.parentId,
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
    .where(where)
    .orderBy(borrowersTable.name)
    .limit(limit)
    .offset((page - 1) * limit);

  const enriched = await Promise.all(rawBorrowers.map(b => enrichBorrower(b)));
  res.json({ data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
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
    principalAmount: String(parsed.data.principalAmount),
    startDate: parsed.data.startDate instanceof Date
      ? parsed.data.startDate.toISOString().split("T")[0]
      : String(parsed.data.startDate),
    endDate: parsed.data.endDate instanceof Date
      ? parsed.data.endDate.toISOString().split("T")[0]
      : (parsed.data.endDate ?? undefined),
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
      parentId: borrowersTable.parentId,
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
  if (borrower.userId !== appUser.id && appUser.role !== "admin") {
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
  if (existing.userId !== appUser.id && appUser.role !== "admin") {
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
  if (existing.userId !== appUser.id && appUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Also delete all sub-accounts and their payments
  const subAccounts = await db.select({ id: borrowersTable.id }).from(borrowersTable).where(eq(borrowersTable.parentId, params.data.id));
  for (const sub of subAccounts) {
    await db.delete(paymentsTable).where(eq(paymentsTable.borrowerId, sub.id));
    await db.delete(borrowersTable).where(eq(borrowersTable.id, sub.id));
  }
  await db.delete(paymentsTable).where(eq(paymentsTable.borrowerId, params.data.id));
  await db.delete(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  res.sendStatus(204);
});

// ── Sub-accounts ──────────────────────────────────────────────────────────────

/** Get the current outstanding principal for a borrower (latest payment with outstandingPrincipal, or principalAmount) */
async function getOutstandingPrincipal(borrowerId: number, principalAmount: number): Promise<number> {
  const payments = await db.select({ outstandingPrincipal: paymentsTable.outstandingPrincipal, year: paymentsTable.year, month: paymentsTable.month })
    .from(paymentsTable)
    .where(eq(paymentsTable.borrowerId, borrowerId))
    .orderBy(sql`year DESC, month DESC`);
  for (const p of payments) {
    if (p.outstandingPrincipal != null) return Number(p.outstandingPrincipal);
  }
  return principalAmount;
}

router.get("/borrowers/:id/sub-accounts", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = ListBorrowerSubAccountsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [parent] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  if (!parent) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (parent.userId !== appUser.id && appUser.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const subAccounts = await db
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
      parentId: borrowersTable.parentId,
      createdAt: borrowersTable.createdAt,
      updatedAt: borrowersTable.updatedAt,
      userName: usersTable.name,
    })
    .from(borrowersTable)
    .leftJoin(usersTable, eq(borrowersTable.userId, usersTable.id))
    .where(eq(borrowersTable.parentId, params.data.id))
    .orderBy(borrowersTable.startDate);

  const enriched = await Promise.all(subAccounts.map(b => enrichBorrower(b)));
  res.json(enriched);
});

router.post("/borrowers/:id/sub-accounts", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = CreateBorrowerSubAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [parent] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  if (!parent) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (parent.userId !== appUser.id && appUser.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  if (parent.parentId != null) { res.status(400).json({ error: "Cannot add a sub-account to a sub-account" }); return; }

  const parsed = CreateBorrowerSubAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Count existing sub-accounts for naming
  const [{ count: subCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(borrowersTable)
    .where(eq(borrowersTable.parentId, params.data.id));

  const interestRate = Number(parsed.data.interestRate ?? BASE_INTEREST_RATE);
  const commissionRate = round2(Math.max(0, interestRate - BASE_INTEREST_RATE));

  const [sub] = await db.insert(borrowersTable).values({
    userId: parent.userId,
    parentId: parent.id,
    name: `${parent.name} (Tranche ${subCount + 2})`,
    address: parent.address,
    phone: parent.phone,
    email: parent.email,
    principalAmount: String(parsed.data.principalAmount),
    interestRate: String(interestRate),
    baseInterestRate: String(BASE_INTEREST_RATE),
    commissionRate: String(commissionRate),
    tenure: parsed.data.tenure ?? null,
    startDate: parsed.data.startDate instanceof Date
      ? parsed.data.startDate.toISOString().split("T")[0]
      : String(parsed.data.startDate),
    status: "active",
    notes: parsed.data.notes || null,
  }).returning();

  const enriched = await enrichBorrower(sub);
  res.status(201).json(enriched);
});

router.post("/borrowers/:id/merge-sub-accounts", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const params = MergeBorrowerSubAccountsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [parent] = await db.select().from(borrowersTable).where(eq(borrowersTable.id, params.data.id));
  if (!parent) { res.status(404).json({ error: "Borrower not found" }); return; }
  if (parent.userId !== appUser.id && appUser.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const subAccounts = await db.select().from(borrowersTable).where(eq(borrowersTable.parentId, params.data.id));
  if (subAccounts.length === 0) { res.status(400).json({ error: "No sub-accounts to merge" }); return; }

  // Compute outstanding for parent and each sub-account
  const parentOutstanding = await getOutstandingPrincipal(params.data.id, Number(parent.principalAmount));
  let totalOutstanding = parentOutstanding;
  for (const sub of subAccounts) {
    const subOutstanding = await getOutstandingPrincipal(sub.id, Number(sub.principalAmount));
    totalOutstanding = round2(totalOutstanding + subOutstanding);
  }

  const subIds = subAccounts.map(s => s.id);

  // Re-parent all payments from sub-accounts to the parent
  if (subIds.length > 0) {
    await db.update(paymentsTable)
      .set({ borrowerId: params.data.id })
      .where(inArray(paymentsTable.borrowerId, subIds));
  }

  // Delete sub-account borrower records
  await db.delete(borrowersTable).where(inArray(borrowersTable.id, subIds));

  // Update parent's principalAmount to the merged total
  const [updated] = await db.update(borrowersTable)
    .set({ principalAmount: String(totalOutstanding), updatedAt: new Date() })
    .where(eq(borrowersTable.id, params.data.id))
    .returning();

  const enriched = await enrichBorrower(updated);
  res.json(enriched);
});

export default router;
