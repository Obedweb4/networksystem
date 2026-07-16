import { pgTable, text, boolean, timestamp, uuid, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { tenantsTable } from "./platform";
import { servicePlansTable } from "./plans";
import { customersTable } from "./customers";

export const voucherStatusEnum = pgEnum("voucher_status", ["UNUSED", "USED", "EXPIRED", "VOID"]);

export const voucherBatchesTable = pgTable("voucher_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => servicePlansTable.id),
  name: text("name").notNull(),
  codePrefix: text("code_prefix"),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vouchersTable = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => voucherBatchesTable.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  status: voucherStatusEnum("status").notNull().default("UNUSED"),
  usedByCustomerId: uuid("used_by_customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoucherBatch = typeof voucherBatchesTable.$inferSelect;
export type Voucher = typeof vouchersTable.$inferSelect;
