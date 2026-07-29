import { Router, type IRouter } from "express";
import { eq, and, sum, sql } from "drizzle-orm";
import { db, fundsTable, borrowersTable, usersTable } from "@workspace/db";
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

  const [disburseRow] = await db
    .select({ total: sum(borrowersTable.principalAmount) })
    .from(borrowersTable)
    .where(and(eq(borrowersTable.userId, targetId), eq(borrowersTable.status, "active")));

  const totalFunded = parseFloat(fundRow?.total ?? "0");
  const totalDisbursed = parseFloat(disburseRow?.total ?? "0");

  res.json(GetUserBalanceResponse.parse({
    userId: targetId,
    totalFunded,
    totalDisbursed,
    available: totalFunded - totalDisbursed,
  }));
});

export default router;
