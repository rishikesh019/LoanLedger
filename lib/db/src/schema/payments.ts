import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { borrowersTable } from "./borrowers";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull().references(() => borrowersTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  // Snapshot of rates/principal at the time of recording
  principalAmount: numeric("principal_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 2 }).notNull(),
  baseInterestRate: numeric("base_interest_rate", { precision: 6, scale: 2 }).notNull().default("10"),
  commissionRate: numeric("commission_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  // Calculated interest amounts (on the outstanding principal for this month)
  interestAmount: numeric("interest_amount", { precision: 15, scale: 2 }).notNull(),
  baseInterestAmount: numeric("base_interest_amount", { precision: 15, scale: 2 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }).notNull(),
  // Actual payment received (may exceed interest → surplus goes to principal)
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }),
  // How much of amountPaid was applied to principal reduction (0 if interest-only)
  principalReduction: numeric("principal_reduction", { precision: 15, scale: 2 }).notNull().default("0"),
  // Outstanding principal AFTER this payment
  outstandingPrincipal: numeric("outstanding_principal", { precision: 15, scale: 2 }),
  isPaid: boolean("is_paid").notNull().default(false),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
