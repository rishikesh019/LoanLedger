import { Router, type IRouter } from "express";
import { eq, and, sum, sql, isNull, inArray } from "drizzle-orm";
import { db, fundsTable, borrowersTable, paymentsTable, usersTable } from "@workspace/db";
import { requireUser, requireAdmin } from "../middlewares/auth";
import {
  CreateFundBody,
  UpdateFundBody,
  ListFundsResponse,
  UpdateFundResponse,
  GetUserBalanceResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /funds — admin sees all, user sees their own
router.get("/funds", requireUser, async (req, res): Promise<void> => {
  const user = (req as any).appUser;

  if (user.role === "admin") {
    const records = await db
      .select({
        id: fundsTable.id,
        adminId: fundsTable.adminId,
        userId: fundsTable.userId,
        amount: fundsTable.amount,
        paymentMethod: fundsTable.paymentMethod,
        notes: fundsTable.notes,
        fundedAt: fundsTable.fundedAt,
        createdAt: fundsTable.createdAt,
        updatedAt: fundsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(fundsTable)
      .leftJoin(usersTable, eq(fundsTable.userId, usersTable.id))
      .orderBy(sql`${fundsTable.fundedAt} DESC`);

    res.json(ListFundsResponse.parse(records));
  } else {
    const records = await db
      .select({
        id: fundsTable.id,
        adminId: fundsTable.adminId,
        userId: fundsTable.userId,
        amount: fundsTable.amount,
        paymentMethod: fundsTable.paymentMethod,
        notes: fundsTable.notes,
        fundedAt: fundsTable.fundedAt,
        createdAt: fundsTable.createdAt,
        updatedAt: fundsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(fundsTable)
      .leftJoin(usersTable, eq(fundsTable.userId, usersTable.id))
      .where(eq(fundsTable.userId, user.id))
      .orderBy(sql`${fundsTable.fundedAt} DESC`);

    res.json(ListFundsResponse.parse(records));
  }
});

// POST /funds — admin only
router.post("/funds", requireAdmin, async (req, res): Promise<void> => {
  const admin = (req as any).appUser;
  const parsed = CreateFundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify target user exists
  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));
  if (!targetUser) {
    res.status(404).json({ error: "Target user not found" });
    return;
  }

  const [fund] = await db.insert(fundsTable).values({
    adminId: admin.id,
    userId: parsed.data.userId,
    amount: String(parsed.data.amount),
    paymentMethod: parsed.data.paymentMethod ?? "online",
    notes: parsed.data.notes,
    fundedAt: parsed.data.fundedAt ? new Date(parsed.data.fundedAt) : new Date(),
  }).returning();

  // Re-fetch with userName
  const [enriched] = await db
    .select({
      id: fundsTable.id,
      adminId: fundsTable.adminId,
      userId: fundsTable.userId,
      amount: fundsTable.amount,
      paymentMethod: fundsTable.paymentMethod,
      notes: fundsTable.notes,
      fundedAt: fundsTable.fundedAt,
      createdAt: fundsTable.createdAt,
      updatedAt: fundsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(fundsTable)
    .leftJoin(usersTable, eq(fundsTable.userId, usersTable.id))
    .where(eq(fundsTable.id, fund.id));

  res.status(201).json(UpdateFundResponse.parse(enriched));
});

// PATCH /funds/:id — admin only
router.patch("/funds/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid fund id" });
    return;
  }
  const parsed = UpdateFundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);
  if (parsed.data.paymentMethod !== undefined) updateData.paymentMethod = parsed.data.paymentMethod;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.fundedAt !== undefined) updateData.fundedAt = new Date(parsed.data.fundedAt);

  const [updated] = await db.update(fundsTable).set(updateData).where(eq(fundsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Fund record not found" });
    return;
  }

  const [enriched] = await db
    .select({
      id: fundsTable.id,
      adminId: fundsTable.adminId,
      userId: fundsTable.userId,
      amount: fundsTable.amount,
      paymentMethod: fundsTable.paymentMethod,
      notes: fundsTable.notes,
      fundedAt: fundsTable.fundedAt,
      createdAt: fundsTable.createdAt,
      updatedAt: fundsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(fundsTable)
    .leftJoin(usersTable, eq(fundsTable.userId, usersTable.id))
    .where(eq(fundsTable.id, id));

  res.json(UpdateFundResponse.parse(enriched));
});

// DELETE /funds/:id — admin only
router.delete("/funds/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid fund id" });
    return;
  }
  const [deleted] = await db.delete(fundsTable).where(eq(fundsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Fund record not found" });
    return;
  }
  res.status(204).send();
});

/** Shared helper: compute current outstanding principal from the most recent payment that recorded it */
function currentOutstanding(
  borrowerId: number,
  fallback: number,
  paymentsByBorrower: Map<number, { outstandingPrincipal: string | null; year: number; month: number }[]>,
): number {
  const pmts = (paymentsByBorrower.get(borrowerId) ?? [])
    .slice()
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  for (const p of pmts) {
    if (p.outstandingPrincipal != null) return Math.round(Number(p.outstandingPrincipal) * 100) / 100;
  }
  return fallback;
}

// GET /admin/users/:id/borrowers — admin only
// Returns top-level active borrowers with combined outstanding (own + sub-account tranches)
router.get("/admin/users/:id/borrowers", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(String(req.params.id), 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Fetch all active borrowers for this user (parents + sub-account tranches)
  const allActive = await db
    .select({
      id: borrowersTable.id,
      name: borrowersTable.name,
      principalAmount: borrowersTable.principalAmount,
      interestRate: borrowersTable.interestRate,
      status: borrowersTable.status,
      parentId: borrowersTable.parentId,
    })
    .from(borrowersTable)
    .where(and(eq(borrowersTable.userId, targetId), eq(borrowersTable.status, "active")));

  if (allActive.length === 0) {
    res.json([]);
    return;
  }

  // Fetch payments to compute outstanding principal
  const borrowerIds = allActive.map(b => b.id);
  const payments = await db
    .select({ borrowerId: paymentsTable.borrowerId, outstandingPrincipal: paymentsTable.outstandingPrincipal, year: paymentsTable.year, month: paymentsTable.month })
    .from(paymentsTable)
    .where(inArray(paymentsTable.borrowerId, borrowerIds));

  const paymentsByBorrower = new Map<number, { outstandingPrincipal: string | null; year: number; month: number }[]>();
  for (const p of payments) {
    if (!paymentsByBorrower.has(p.borrowerId)) paymentsByBorrower.set(p.borrowerId, []);
    paymentsByBorrower.get(p.borrowerId)!.push(p);
  }

  // Separate top-level active borrowers from sub-account tranches
  const activeIds = new Set(allActive.map(b => b.id));
  const topLevel = allActive.filter(b => b.parentId == null);
  const activeSubs = allActive.filter(b => b.parentId != null);

  // Group active sub-accounts by their parent
  const subsByParent = new Map<number, typeof allActive>();
  for (const b of activeSubs) {
    const pid = b.parentId!;
    if (!subsByParent.has(pid)) subsByParent.set(pid, []);
    subsByParent.get(pid)!.push(b);
  }

  const result: { id: number; name: string; principalAmount: number; interestRate: number; status: string }[] = [];

  // Emit top-level active borrowers: own outstanding + all their active sub-accounts' outstanding
  for (const b of topLevel) {
    const ownOutstanding = currentOutstanding(b.id, Number(b.principalAmount), paymentsByBorrower);
    const subsOutstanding = (subsByParent.get(b.id) ?? []).reduce(
      (s, sub) => s + currentOutstanding(sub.id, Number(sub.principalAmount), paymentsByBorrower),
      0,
    );
    result.push({
      id: b.id,
      name: b.name,
      principalAmount: Math.round((ownOutstanding + subsOutstanding) * 100) / 100,
      interestRate: Number(b.interestRate),
      status: b.status,
    });
  }

  // Emit "orphaned" active sub-accounts whose parent is NOT itself active
  // (closed parent can have active tranches; they must still appear to reconcile with totalDisbursed)
  for (const sub of activeSubs) {
    if (!activeIds.has(sub.parentId!)) {
      result.push({
        id: sub.id,
        name: sub.name,
        principalAmount: Math.round(currentOutstanding(sub.id, Number(sub.principalAmount), paymentsByBorrower) * 100) / 100,
        interestRate: Number(sub.interestRate),
        status: sub.status,
      });
    }
  }

  result.sort((a, b) => b.principalAmount - a.principalAmount);
  res.json(result);
});

// GET /users/:id/balance — admin or self
router.get("/users/:id/balance", requireUser, async (req, res): Promise<void> => {
  const callerUser = (req as any).appUser;
  const targetId = parseInt(String(req.params.id), 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  // Only admins can see other users' balances; a user can only see their own
  if (callerUser.role !== "admin" && callerUser.id !== targetId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [fundRow] = await db
    .select({ total: sum(fundsTable.amount) })
    .from(fundsTable)
    .where(eq(fundsTable.userId, targetId));

  // Fetch all active borrowers (parents + sub-account tranches — both count toward deployed capital)
  const userActiveBorrowers = await db
    .select({ id: borrowersTable.id, principalAmount: borrowersTable.principalAmount })
    .from(borrowersTable)
    .where(and(eq(borrowersTable.userId, targetId), eq(borrowersTable.status, "active")));

  // Use current outstanding principal (from payments) rather than original principalAmount
  let paymentMap = new Map<number, { outstandingPrincipal: string | null; year: number; month: number }[]>();
  if (userActiveBorrowers.length > 0) {
    const bIds = userActiveBorrowers.map(b => b.id);
    const pmts = await db
      .select({ borrowerId: paymentsTable.borrowerId, outstandingPrincipal: paymentsTable.outstandingPrincipal, year: paymentsTable.year, month: paymentsTable.month })
      .from(paymentsTable)
      .where(inArray(paymentsTable.borrowerId, bIds));
    for (const p of pmts) {
      if (!paymentMap.has(p.borrowerId)) paymentMap.set(p.borrowerId, []);
      paymentMap.get(p.borrowerId)!.push(p);
    }
  }

  const totalFunded = parseFloat(fundRow?.total ?? "0");
  const totalDisbursed = Math.round(
    userActiveBorrowers.reduce((s, b) => s + currentOutstanding(b.id, Number(b.principalAmount), paymentMap), 0) * 100
  ) / 100;

  res.json(GetUserBalanceResponse.parse({
    userId: targetId,
    totalFunded,
    totalDisbursed,
    available: totalFunded - totalDisbursed,
  }));
});

export default router;
