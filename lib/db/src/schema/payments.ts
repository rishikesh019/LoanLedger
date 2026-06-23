import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { borrowersTable } from "./borrowers";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull().references(() => borrowersTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  principalAmount: numeric("principal_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 2 }).notNull(),
  baseInterestRate: numeric("base_interest_rate", { precision: 6, scale: 2 }).notNull().default("10"),
  commissionRate: numeric("commission_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  interestAmount: numeric("interest_amount", { precision: 15, scale: 2 }).notNull(),
  baseInterestAmount: numeric("base_interest_amount", { precision: 15, scale: 2 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
