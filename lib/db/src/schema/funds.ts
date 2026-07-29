import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const fundsTable = pgTable("funds", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => usersTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("online"),
  notes: text("notes"),
  fundedAt: timestamp("funded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFundSchema = createInsertSchema(fundsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFund = z.infer<typeof insertFundSchema>;
export type Fund = typeof fundsTable.$inferSelect;
