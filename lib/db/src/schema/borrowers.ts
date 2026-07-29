import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const borrowersTable = pgTable("borrowers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
  email: text("email"),
  principalAmount: numeric("principal_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 2 }).notNull().default("10"),
  baseInterestRate: numeric("base_interest_rate", { precision: 6, scale: 2 }).notNull().default("10"),
  commissionRate: numeric("commission_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  tenure: integer("tenure"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  parentId: integer("parent_id"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBorrowerSchema = createInsertSchema(borrowersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBorrower = z.infer<typeof insertBorrowerSchema>;
export type Borrower = typeof borrowersTable.$inferSelect;
