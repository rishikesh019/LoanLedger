import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, borrowersTable, paymentsTable, usersTable, fundsTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetMonthlyStatsQueryParams,
  GetYearlyStatsQueryParams,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

router.get("/analytics/dashboard", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const isAdmin = appUser.role === "admin";

  const borrowers = await db.select().from(borrowersTable)
    .where(isAdmin ? undefined : eq(borrowersTable.userId, appUser.id));

  const payments = await db.select().from(paymentsTable)
    .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
    .where(isAdmin ? undefined : eq(borrowersTable.userId, appUser.id));

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const activeBorrowers = borrowers.filter(b => b.status === "active").length;
  const closedBorrowers = borrowers.filter(b => b.status === "closed").length;
  const defaultedBorrowers = borrowers.filter(b => b.status === "defaulted").length;
  const totalPrincipal = round2(borrowers.reduce((sum, b) => sum + Number(b.principalAmount), 0));

  const paidPayments = payments.filter(p => p.payments.isPaid);
  const totalInterestEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.interestAmount), 0));
  const totalBaseInterestEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.baseInterestAmount), 0));
  const totalCommissionEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.commissionAmount), 0));
  const pendingPaymentsCount = payments.filter(p => !p.payments.isPaid).length;

  const currentMonthPayments = payments.filter(
    p => p.payments.month === currentMonth && p.payments.year === currentYear
  );
  const currentMonthInterest = round2(currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + Number(p.payments.interestAmount), 0));
  const currentMonthBaseInterest = round2(currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + Number(p.payments.baseInterestAmount), 0));
  const currentMonthCommission = round2(currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + Number(p.payments.commissionAmount), 0));

  res.json(GetDashboardStatsResponse.parse({
    totalBorrowers: borrowers.length,
    activeBorrowers,
    closedBorrowers,
    defaultedBorrowers,
    totalPrincipal,
    totalInterestEarned,
    totalBaseInterestEarned,
    totalCommissionEarned,
    pendingPaymentsCount,
    currentMonthInterest,
    currentMonthBaseInterest,
    currentMonthCommission,
  }));
});

router.get("/analytics/monthly", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const queryParams = GetMonthlyStatsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { year, userId } = queryParams.data;
  const isAdmin = appUser.role === "admin";

  const payments = await db.select().from(paymentsTable)
    .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
    .where(
      isAdmin && userId
        ? eq(borrowersTable.userId, userId)
        : isAdmin
          ? undefined
          : eq(borrowersTable.userId, appUser.id)
    );

  const filtered = year ? payments.filter(p => p.payments.year === year) : payments;

  const monthMap: Record<string, any> = {};
  for (const row of filtered) {
    const p = row.payments;
    const key = `${p.year}-${p.month}`;
    if (!monthMap[key]) {
      monthMap[key] = { month: p.month, year: p.year, totalInterest: 0, baseInterest: 0, commission: 0, paymentsCount: 0, paidCount: 0, principalOutstanding: 0 };
    }
    monthMap[key].paymentsCount++;
    if (p.isPaid) {
      monthMap[key].paidCount++;
      monthMap[key].totalInterest += Number(p.interestAmount);
      monthMap[key].baseInterest += Number(p.baseInterestAmount);
      monthMap[key].commission += Number(p.commissionAmount);
    }
    monthMap[key].principalOutstanding += Number(p.principalAmount);
  }

  const result = Object.values(monthMap)
    .map(m => ({ ...m, totalInterest: round2(m.totalInterest), baseInterest: round2(m.baseInterest), commission: round2(m.commission), principalOutstanding: round2(m.principalOutstanding) }))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  res.json(result);
});

router.get("/analytics/yearly", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const queryParams = GetYearlyStatsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { userId } = queryParams.data;
  const isAdmin = appUser.role === "admin";

  const payments = await db.select().from(paymentsTable)
    .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
    .where(
      isAdmin && userId
        ? eq(borrowersTable.userId, userId)
        : isAdmin
          ? undefined
          : eq(borrowersTable.userId, appUser.id)
    );

  const yearMap: Record<number, any> = {};
  for (const row of payments) {
    const p = row.payments;
    if (!yearMap[p.year]) {
      yearMap[p.year] = { year: p.year, totalInterest: 0, baseInterest: 0, commission: 0, paymentsCount: 0, paidCount: 0 };
    }
    yearMap[p.year].paymentsCount++;
    if (p.isPaid) {
      yearMap[p.year].paidCount++;
      yearMap[p.year].totalInterest += Number(p.interestAmount);
      yearMap[p.year].baseInterest += Number(p.baseInterestAmount);
      yearMap[p.year].commission += Number(p.commissionAmount);
    }
  }

  const result = Object.values(yearMap)
    .map(y => ({ ...y, totalInterest: round2(y.totalInterest), baseInterest: round2(y.baseInterest), commission: round2(y.commission) }))
    .sort((a, b) => a.year - b.year);
  res.json(result);
});

router.get("/analytics/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).where(eq(usersTable.isActive, true));

  const result = await Promise.all(users.map(async (user) => {
    const borrowers = await db.select().from(borrowersTable).where(eq(borrowersTable.userId, user.id));
    const payments = await db.select().from(paymentsTable)
      .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
      .where(eq(borrowersTable.userId, user.id));
    const paidPayments = payments.filter(p => p.payments.isPaid);
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      totalBorrowers: borrowers.length,
      activeBorrowers: borrowers.filter(b => b.status === "active").length,
      totalPrincipal: round2(borrowers.reduce((sum, b) => sum + Number(b.principalAmount), 0)),
      totalInterest: round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.interestAmount), 0)),
      totalBaseInterest: round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.baseInterestAmount), 0)),
      totalCommission: round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.commissionAmount), 0)),
    };
  }));

  res.json(result);
});

router.get("/analytics/admin-dashboard", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const borrowers = await db.select().from(borrowersTable);
  const payments = await db.select().from(paymentsTable)
    .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id));

  const paidPayments = payments.filter(p => p.payments.isPaid);
  const totalInterestEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.interestAmount), 0));
  const totalBaseInterestEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.baseInterestAmount), 0));
  const totalCommissionEarned = round2(paidPayments.reduce((sum, p) => sum + Number(p.payments.commissionAmount), 0));

  const monthMap: Record<string, any> = {};
  for (const row of payments) {
    const p = row.payments;
    const key = `${p.year}-${p.month}`;
    if (!monthMap[key]) {
      monthMap[key] = { month: p.month, year: p.year, totalInterest: 0, baseInterest: 0, commission: 0, paymentsCount: 0, paidCount: 0 };
    }
    monthMap[key].paymentsCount++;
    if (p.isPaid) {
      monthMap[key].paidCount++;
      monthMap[key].totalInterest += Number(p.interestAmount);
      monthMap[key].baseInterest += Number(p.baseInterestAmount);
      monthMap[key].commission += Number(p.commissionAmount);
    }
  }
  const monthlyTrend = Object.values(monthMap)
    .map(m => ({ ...m, totalInterest: round2(m.totalInterest), baseInterest: round2(m.baseInterest), commission: round2(m.commission) }))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .slice(-12);

  const activeUsers = users.filter(u => u.isActive);
  const topPerformers = await Promise.all(activeUsers.map(async (user) => {
    const userBorrowers = await db.select().from(borrowersTable).where(eq(borrowersTable.userId, user.id));
    const userPayments = await db.select().from(paymentsTable)
      .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
      .where(eq(borrowersTable.userId, user.id));
    const paid = userPayments.filter(p => p.payments.isPaid);
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      totalBorrowers: userBorrowers.length,
      activeBorrowers: userBorrowers.filter(b => b.status === "active").length,
      totalPrincipal: round2(userBorrowers.reduce((sum, b) => sum + Number(b.principalAmount), 0)),
      totalInterest: round2(paid.reduce((sum, p) => sum + Number(p.payments.interestAmount), 0)),
      totalBaseInterest: round2(paid.reduce((sum, p) => sum + Number(p.payments.baseInterestAmount), 0)),
      totalCommission: round2(paid.reduce((sum, p) => sum + Number(p.payments.commissionAmount), 0)),
    };
  }));
  topPerformers.sort((a, b) => b.totalInterest - a.totalInterest);

  res.json({
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive).length,
    totalBorrowers: borrowers.length,
    activeBorrowers: borrowers.filter(b => b.status === "active").length,
    totalPrincipalDeployed: round2(borrowers.reduce((sum, b) => sum + Number(b.principalAmount), 0)),
    totalInterestEarned,
    totalBaseInterestEarned,
    totalCommissionEarned,
    monthlyTrend,
    topPerformers: topPerformers.slice(0, 10),
  });
});

// GET /analytics/fund-analytics — admin only
router.get("/analytics/fund-analytics", requireAdmin, async (_req, res): Promise<void> => {
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const METHOD_LABELS: Record<string, string> = {
    online: "Online Transfer", bank_transfer: "Bank Transfer",
    cash: "Cash", cheque: "Cheque", upi: "UPI", neft: "NEFT / RTGS",
  };

  // Load raw data — count ALL active borrowers (parents + sub-account tranches);
  // sub-accounts are additive capital, not splits of the parent principal.
  const funds = await db.select().from(fundsTable);
  const activeBorrowers = await db.select().from(borrowersTable).where(eq(borrowersTable.status, "active"));
  const allPayments = await db.select().from(paymentsTable);

  // ── Compute current outstanding principal per borrower ──
  // Use the most recent payment that recorded outstandingPrincipal; fall back to principalAmount.
  // This mirrors the logic in getOutstandingPrincipal() in borrowers.ts.
  const paymentsByBorrower = new Map<number, typeof allPayments>();
  for (const p of allPayments) {
    if (!paymentsByBorrower.has(p.borrowerId)) paymentsByBorrower.set(p.borrowerId, []);
    paymentsByBorrower.get(p.borrowerId)!.push(p);
  }
  function currentOutstanding(borrowerId: number, fallback: number): number {
    const pmts = (paymentsByBorrower.get(borrowerId) ?? [])
      .slice()
      .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
    for (const p of pmts) {
      if (p.outstandingPrincipal != null) return round2(Number(p.outstandingPrincipal));
    }
    return fallback;
  }

  // ── Totals ──
  const totalFunded = round2(funds.reduce((s, f) => s + Number(f.amount), 0));
  const totalDisbursed = round2(
    activeBorrowers.reduce((s, b) => s + currentOutstanding(b.id, Number(b.principalAmount)), 0)
  );
  const totalAvailable = round2(totalFunded - totalDisbursed);
  const utilizationRate = totalFunded > 0 ? round2((totalDisbursed / totalFunded) * 100) : 0;

  // ── At-risk: outstanding principal of active borrowers with ≥1 overdue payment ──
  const now = new Date();
  const currentKey = now.getFullYear() * 12 + now.getMonth(); // month is 0-based
  const overdueByBorrower = new Set<number>();
  for (const p of allPayments) {
    if (!p.isPaid && (p.year * 12 + (p.month - 1)) < currentKey) {
      overdueByBorrower.add(p.borrowerId);
    }
  }
  const atRisk = round2(
    activeBorrowers
      .filter(b => overdueByBorrower.has(b.id))
      .reduce((s, b) => s + currentOutstanding(b.id, Number(b.principalAmount)), 0)
  );

  // ── Monthly inflows — last 12 months ──
  const monthMap: Record<string, { year: number; month: number; amount: number; count: number }> = {};
  for (const f of funds) {
    const d = new Date(f.fundedAt);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { year: y, month: m, amount: 0, count: 0 };
    monthMap[key].amount += Number(f.amount);
    monthMap[key].count += 1;
  }
  const monthlyInflows = Object.values(monthMap)
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .slice(-12)
    .map(m => ({
      year: m.year,
      month: m.month,
      label: `${MONTHS_SHORT[m.month - 1]} ${m.year}`,
      amount: round2(m.amount),
      count: m.count,
    }));

  // ── Payment method breakdown ──
  const methodMap: Record<string, { amount: number; count: number }> = {};
  for (const f of funds) {
    const method = f.paymentMethod ?? "online";
    if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
    methodMap[method].amount += Number(f.amount);
    methodMap[method].count += 1;
  }
  const paymentMethodBreakdown = Object.entries(methodMap)
    .map(([method, { amount, count }]) => ({
      method,
      label: METHOD_LABELS[method] ?? method,
      amount: round2(amount),
      count,
    }))
    .sort((a, b) => b.amount - a.amount);

  res.json({ totalFunded, totalDisbursed, totalAvailable, atRisk, utilizationRate, monthlyInflows, paymentMethodBreakdown });
});

export default router;
