import { pgTable, text, boolean, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { tenantsTable } from "./platform";
import { customersTable } from "./customers";

export const notificationChannelEnum = pgEnum("notification_channel", ["SMS", "EMAIL", "WHATSAPP"]);
export const notificationStatusEnum = pgEnum("notification_status", ["QUEUED", "SENT", "DELIVERED", "FAILED"]);

export const notificationTemplatesTable = pgTable("notification_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  channel: notificationChannelEnum("channel").notNull(),
  subject: text("subject"),
  bodyTemplate: text("body_template").notNull(),
  variables: text("variables").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLogsTable = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => notificationTemplatesTable.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  channel: notificationChannelEnum("channel").notNull(),
  recipient: text("recipient").notNull(),
  status: notificationStatusEnum("status").notNull().default("QUEUED"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
