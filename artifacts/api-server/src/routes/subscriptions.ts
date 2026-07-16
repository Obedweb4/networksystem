import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, servicePlansTable, customersTable } from "@workspace/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import {
  ListSubscriptionsQueryParams, CreateSubscriptionBody,
  GetSubscriptionParams, UpdateSubscriptionParams, UpdateSubscriptionBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/subscriptions", requireAuth, async (req, res) => {
  const parse = ListSubscriptionsQueryParams.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { tenantId } = req.user!;
  const { page, limit, customerId, status } = parse.data;
  const offset = (page - 1) * limit;
  const conditions = [eq(subscriptionsTable.tenantId, tenantId)];
  if (customerId) conditions.push(eq(subscriptionsTable.customerId, customerId));
  if (status) conditions.push(eq(subscriptionsTable.status, status));
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      sub: subscriptionsTable,
      planName: servicePlansTable.name,
      customerName: sql<string>`${customersTable.firstName} || ' ' || ${customersTable.lastName}`,
    }).from(subscriptionsTable)
      .leftJoin(servicePlansTable, eq(subscriptionsTable.planId, servicePlansTable.id))
      .leftJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
      .where(and(...conditions)).orderBy(desc(subscriptionsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(subscriptionsTable).where(and(...conditions)),
  ]);
  res.json({ data: rows.map(r => ({ ...r.sub, planName: r.planName, customerName: r.customerName })), total: Number(total), page, limit });
});

router.post("/subscriptions", requireAuth, async (req, res) => {
  const parse = CreateSubscriptionBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation failed", details: parse.error.issues }); return; }
  const { tenantId } = req.user!;
  const [plan] = await db.select().from(servicePlansTable).where(eq(servicePlansTable.id, parse.data.planId)).limit(1);
  if (!plan) { res.status(400).json({ error: "Plan not found" }); return; }
  const startsAt = parse.data.startsAt;
  const expiresAt = new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
  const [sub] = await db.insert(subscriptionsTable).values({ tenantId, customerId: parse.data.customerId, planId: parse.data.planId, startsAt, expiresAt, autoRenew: parse.data.autoRenew ?? false }).returning();
  res.status(201).json(sub);
});

router.get("/subscriptions/:id", requireAuth, async (req, res) => {
  const parse = GetSubscriptionParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { tenantId } = req.user!;
  const [row] = await db.select({
    sub: subscriptionsTable,
    planName: servicePlansTable.name,
    customerName: sql<string>`${customersTable.firstName} || ' ' || ${customersTable.lastName}`,
  }).from(subscriptionsTable)
    .leftJoin(servicePlansTable, eq(subscriptionsTable.planId, servicePlansTable.id))
    .leftJoin(customersTable, eq(subscriptionsTable.customerId, customersTable.id))
    .where(and(eq(subscriptionsTable.id, parse.data.id), eq(subscriptionsTable.tenantId, tenantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Subscription not found" }); return; }
  res.json({ ...row.sub, planName: row.planName, customerName: row.customerName });
});

router.put("/subscriptions/:id", requireAuth, async (req, res) => {
  const paramParse = UpdateSubscriptionParams.safeParse(req.params);
  const bodyParse = UpdateSubscriptionBody.safeParse(req.body);
  if (!paramParse.success || !bodyParse.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const { tenantId } = req.user!;
  const [updated] = await db.update(subscriptionsTable).set({ ...bodyParse.data, updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.id, paramParse.data.id), eq(subscriptionsTable.tenantId, tenantId))).returning();
  if (!updated) { res.status(404).json({ error: "Subscription not found" }); return; }
  res.json(updated);
});

export default router;
