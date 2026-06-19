import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { borrowersTable } from "./borrowers";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull().references(() => borrowersTable.id),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  principalAmount: real("principal_amount").notNull(),
  interestRate: real("interest_rate").notNull(),
  baseInterestRate: real("base_interest_rate").notNull().default(10),
  commissionRate: real("commission_rate").notNull().default(0),
  interestAmount: real("interest_amount").notNull(),
  baseInterestAmount: real("base_interest_amount").notNull(),
  commissionAmount: real("commission_amount").notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
