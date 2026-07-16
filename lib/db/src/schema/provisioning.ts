import { pgTable, text, timestamp, uuid, pgEnum, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./platform";
import { subscriptionsTable } from "./subscriptions";
import { routersTable } from "./routers";
import { customersTable } from "./customers";

/**
 * Enum for provisioning status tracking
 */
export const provisioningStatusEnum = pgEnum("provisioning_status", [
  "PENDING",
  "IN_PROGRESS",
  "SUCCESS",
  "FAILED",
  "SUSPENDED",
  "DEPROVISIONED",
]);

/**
 * Tracks provisioning state of subscriptions on routers
 * Bridges subscriptions to their router-side provisioning status
 *
 * Example:
 * - Subscription created (status: ACTIVE) → provisioning status: IN_PROGRESS
 * - PPPoE user created on router → provisioning status: SUCCESS
 * - User queries router → provisioning status: verifies user still exists
 * - Subscription suspended → provisioning status: SUSPENDED
 */
export const provisioningMappingsTable = pgTable("provisioning_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .unique()
    .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routersTable.id, { onDelete: "restrict" }),

  // Router-side credentials (non-secret, username only)
  routerUsername: text("router_username").notNull(),

  // Provisioning state
  status: provisioningStatusEnum("status").notNull().default("PENDING"),

  // Audit trail
  lastProvisioningAttempt: timestamp("last_provisioning_attempt", {
    withTimezone: true,
  }),
  lastProvisioningError: text("last_provisioning_error"),
  lastProvisioningErrorCode: text("last_provisioning_error_code"),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Audit log for all provisioning operations
 * Immutable record of what happened and when
 *
 * Used for:
 * - Troubleshooting provisioning failures
 * - Compliance/audit trails
 * - Performance analysis
 * - Debugging customer issues
 */
export const provisioningAuditLogsTable = pgTable("provisioning_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routersTable.id, { onDelete: "restrict" }),

  // Action type
  action: text("action").notNull(), // PROVISION, DEPROVISION, SUSPEND, RESUME

  // Result
  status: text("status").notNull(), // SUCCESS, FAILED
  routerUsername: text("router_username"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  // Performance tracking
  durationMs: integer("duration_ms"),

  // Timeline
  executedAt: timestamp("executed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProvisioningMapping = typeof provisioningMappingsTable.$inferSelect;
export type ProvisioningAuditLog =
  typeof provisioningAuditLogsTable.$inferSelect;
