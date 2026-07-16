import { pgTable, text, boolean, timestamp, uuid, numeric, integer, pgEnum } from "drizzle-orm/pg-core";
import { tenantsTable } from "./platform";

export const planTypeEnum = pgEnum("plan_type", ["HOTSPOT", "PPPOE"]);

export const servicePlansTable = pgTable("service_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: planTypeEnum("type").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  dataLimitMb: integer("data_limit_mb"),
  speedUpKbps: integer("speed_up_kbps"),
  speedDownKbps: integer("speed_down_kbps"),
  validityHours: integer("validity_hours"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServicePlan = typeof servicePlansTable.$inferSelect;
