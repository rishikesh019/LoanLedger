import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, borrowersTable, paymentsTable, usersTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetMonthlyStatsQueryParams,
  GetYearlyStatsQueryParams,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/analytics/dashboard", requireUser, async (req, res): Promise<void> => {
  const appUser = (req as any).appUser;
  const isAdmin = appUser.role === "admin";

  const userCondition = isAdmin ? undefined : eq(borrowersTable.userId, appUser.id);

  const borrowers = await db.select().from(borrowersTable)
    .where(userCondition);

  const payments = await db.select().from(paymentsTable)
    .leftJoin(borrowersTable, eq(paymentsTable.borrowerId, borrowersTable.id))
    .where(userCondition ? eq(borrowersTable.userId, appUser.id) : undefined);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const activeBorrowers = borrowers.filter(b => b.status === "active").length;
  const closedBorrowers = borrowers.filter(b => b.status === "closed").length;
  const defaultedBorrowers = borrowers.filter(b => b.status === "defaulted").length;
  const totalPrincipal = borrowers.reduce((sum, b) => sum + b.principalAmount, 0);

  const paidPayments = payments.filter(p => p.payments.isPaid);
  const totalInterestEarned = paidPayments.reduce((sum, p) => sum + p.payments.interestAmount, 0);
  const totalBaseInterestEarned = paidPayments.reduce((sum, p) => sum + p.payments.baseInterestAmount, 0);
  const totalCommissionEarned = paidPayments.reduce((sum, p) => sum + p.payments.commissionAmount, 0);
  const pendingPaymentsCount = payments.filter(p => !p.payments.isPaid).length;

  const currentMonthPayments = payments.filter(
    p => p.payments.month === currentMonth && p.payments.year === currentYear
  );
  const currentMonthInterest = currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + p.payments.interestAmount, 0);
  const currentMonthBaseInterest = currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + p.payments.baseInterestAmount, 0);
  const currentMonthCommission = currentMonthPayments.filter(p => p.payments.isPaid).reduce((sum, p) => sum + p.payments.commissionAmount, 0);

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
      monthMap[key].totalInterest += p.interestAmount;
      monthMap[key].baseInterest += p.baseInterestAmount;
      monthMap[key].commission += p.commissionAmount;
    }
    monthMap[key].principalOutstanding += p.principalAmount;
  }

  const result = Object.values(monthMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
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
      yearMap[p.year].totalInterest += p.interestAmount;
      yearMap[p.year].baseInterest += p.baseInterestAmount;
      yearMap[p.year].commission += p.commissionAmount;
    }
  }

  const result = Object.values(yearMap).sort((a, b) => a.year - b.year);
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
      totalPrincipal: borrowers.reduce((sum, b) => sum + b.principalAmount, 0),
      totalInterest: paidPayments.reduce((sum, p) => sum + p.payments.interestAmount, 0),
      totalBaseInterest: paidPayments.reduce((sum, p) => sum + p.payments.baseInterestAmount, 0),
      totalCommission: paidPayments.reduce((sum, p) => sum + p.payments.commissionAmount, 0),
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
  const totalInterestEarned = paidPayments.reduce((sum, p) => sum + p.payments.interestAmount, 0);
  const totalBaseInterestEarned = paidPayments.reduce((sum, p) => sum + p.payments.baseInterestAmount, 0);
  const totalCommissionEarned = paidPayments.reduce((sum, p) => sum + p.payments.commissionAmount, 0);

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
      monthMap[key].totalInterest += p.interestAmount;
      monthMap[key].baseInterest += p.baseInterestAmount;
      monthMap[key].commission += p.commissionAmount;
    }
  }
  const monthlyTrend = Object.values(monthMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).slice(-12);

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
      totalPrincipal: userBorrowers.reduce((sum, b) => sum + b.principalAmount, 0),
      totalInterest: paid.reduce((sum, p) => sum + p.payments.interestAmount, 0),
      totalBaseInterest: paid.reduce((sum, p) => sum + p.payments.baseInterestAmount, 0),
      totalCommission: paid.reduce((sum, p) => sum + p.payments.commissionAmount, 0),
    };
  }));
  topPerformers.sort((a, b) => b.totalInterest - a.totalInterest);

  res.json({
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive).length,
    totalBorrowers: borrowers.length,
    activeBorrowers: borrowers.filter(b => b.status === "active").length,
    totalPrincipalDeployed: borrowers.reduce((sum, b) => sum + b.principalAmount, 0),
    totalInterestEarned,
    totalBaseInterestEarned,
    totalCommissionEarned,
    monthlyTrend,
    topPerformers: topPerformers.slice(0, 10),
  });
});

export default router;
