import { pgTable, text, boolean, timestamp, uuid, integer, pgEnum, bigint } from "drizzle-orm/pg-core";
import { tenantsTable, sitesTable } from "./platform";
import { customersTable } from "./customers";

export const alertSeverityEnum = pgEnum("alert_severity", ["INFO", "WARN", "CRITICAL"]);

export const routersTable = pgTable("routers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").references(() => sitesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  apiPort: integer("api_port").notNull().default(8728),
  apiUsername: text("api_username").notNull(),
  apiSecret: text("api_secret").notNull(),
  model: text("model"),
  firmwareVersion: text("firmware_version"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routerAlertsTable = pgTable("router_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  routerId: uuid("router_id").notNull().references(() => routersTable.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  message: text("message").notNull(),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hotspotSessionsTable = pgTable("hotspot_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  routerId: uuid("router_id").notNull().references(() => routersTable.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  macAddress: text("mac_address").notNull(),
  ipAddress: text("ip_address"),
  bytesIn: bigint("bytes_in", { mode: "number" }).notNull().default(0),
  bytesOut: bigint("bytes_out", { mode: "number" }).notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type Router = typeof routersTable.$inferSelect;
export type RouterAlert = typeof routerAlertsTable.$inferSelect;
export type HotspotSession = typeof hotspotSessionsTable.$inferSelect
