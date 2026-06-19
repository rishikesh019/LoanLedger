import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
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
  principalAmount: real("principal_amount").notNull(),
  interestRate: real("interest_rate").notNull().default(10),
  baseInterestRate: real("base_interest_rate").notNull().default(10),
  commissionRate: real("commission_rate").notNull().default(0),
  tenure: integer("tenure"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBorrowerSchema = createInsertSchema(borrowersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBorrower = z.infer<typeof insertBorrowerSchema>;
export type Borrower = typeof borrowersTable.$inferSelect;
