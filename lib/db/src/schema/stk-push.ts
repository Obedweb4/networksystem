import { pgTable, text, timestamp, uuid, numeric, pgEnum } from "drizzle-orm/pg-core";
import { tenantsTable } from "./platform";
import { customersTable } from "./customers";
import { servicePlansTable } from "./plans";

export const stkPushStatusEnum = pgEnum("stk_push_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);

/**
 * Tracks a simulated M-PESA STK Push request initiated from the captive
 * portal "Buy" flow. A real integration would populate `checkoutRequestId`
 * from Safaricom's Daraja API and update status via the callback webhook;
 * this demo environment resolves the request automatically after a short
 * delay to emulate the customer approving the prompt on their phone.
 */
export const stkPushRequestsTable = pgTable("stk_push_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => servicePlansTable.id),
  phone: text("phone").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  checkoutRequestId: text("checkout_request_id").notNull(),
  status: stkPushStatusEnum("status").notNull().default("PENDING"),
  failureReason: text("failure_reason"),
  subscriptionId: uuid("subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StkPushRequest = typeof stkPushRequestsTable.$inferSelect;
