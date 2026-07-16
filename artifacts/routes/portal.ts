import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { bongaAccountsTable, bongaTransactionsTable, customerPortalRefreshTokensTable, customersTable, hotspotSessionsTable, routersTable, servicePlansTable, stkPushRequestsTable, subscriptionsTable, walletsTable } from "@workspace/db/schema";
import { and, desc, eq, gt, isNull, isNotNull, sql } from "drizzle-orm";
import { optionalCustomerAuth, requireCustomerAuth, signCustomerAccessToken } from "../middlewares/customer-auth";

const router: IRouter = Router();
const PHONE = /^0[17]\d{8}$/;
const publicPlan = (p: typeof servicePlansTable.$inferSelect) => ({ id: p.id, name: p.name, description: p.description, price: p.price, durationDays: p.durationDays, validityHours: p.validityHours, dataLimitMb: p.dataLimitMb, speedUpKbps: p.speedUpKbps, speedDownKbps: p.speedDownKbps });
const token = (c: typeof customersTable.$inferSelect) => ({ id: c.id, tenantId: c.tenantId, phone: c.phone, accountNumber: c.accountNumber, role: "customer" as const });
const pushStatus = (p: typeof stkPushRequestsTable.$inferSelect) => ({ id: p.id, status: p.status, checkoutRequestId: p.checkoutRequestId, amount: p.amount, phone: p.phone, failureReason: p.failureReason, subscriptionId: p.subscriptionId });

router.get("/portal/packages", async (req, res) => {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  if (!tenantId) { res.status(400).json({ error: "tenantId is required" }); return; }
  const plans = await db.select().from(servicePlansTable).where(and(eq(servicePlansTable.tenantId, tenantId), eq(servicePlansTable.type, "HOTSPOT"), eq(servicePlansTable.isActive, true))).orderBy(servicePlansTable.price);
  res.json(plans.map(publicPlan));
});

/**
 * Tells the captive portal (login.html) whether — and why — it should show
 * itself to this device, instead of the router silently authorizing it.
 * Built entirely from existing tables (hotspot_sessions.macAddress links a
 * device to a customer; subscriptions.status/expiresAt tells us if their
 * package is still good) — no new schema.
 *
 * `graceHours` is a display-only grace window: it does not touch the
 * router-side expiry sweep (which still disables access exactly at
 * expiresAt). It only affects which reason/copy the portal shows during
 * that window — see mikrotik-hotspot/README.md for the tradeoff.
 */
router.get("/portal/device-status", async (req, res) => {
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const mac = typeof req.query.mac === "string" && req.query.mac.trim() ? req.query.mac.trim().toUpperCase() : undefined;
  const phone = typeof req.query.phone === "string" && PHONE.test(req.query.phone) ? req.query.phone : undefined;
  const graceHours = Math.max(0, Number(req.query.graceHours) || 0);
  if (!tenantId) { res.status(400).json({ error: "tenantId is required" }); return; }

  let customer: typeof customersTable.$inferSelect | undefined;
  if (mac) {
    const [session] = await db.select({ customerId: hotspotSessionsTable.customerId })
      .from(hotspotSessionsTable)
      .innerJoin(routersTable, eq(hotspotSessionsTable.routerId, routersTable.id))
      .where(and(eq(routersTable.tenantId, tenantId), eq(hotspotSessionsTable.macAddress, mac), isNotNull(hotspotSessionsTable.customerId)))
      .orderBy(desc(hotspotSessionsTable.startedAt))
      .limit(1);
    if (session?.customerId) {
      [customer] = await db.select().from(customersTable).where(eq(customersTable.id, session.customerId)).limit(1);
    }
  }
  // Fallback: a customer on a device we've never seen (e.g. new phone) can still
  // be recognized by the number they already pay with — this is the "unknown
  // device, verify by phone" path, and reuses the same phone lookup the
  // guest STK-push flow already does.
  if (!customer && phone) {
    [customer] = await db.select().from(customersTable).where(and(eq(customersTable.tenantId, tenantId), eq(customersTable.phone, phone))).limit(1);
  }

  if (!customer) { res.json({ reason: (mac || phone) ? "UNKNOWN_DEVICE" : "NEW", customer: false, subscription: null }); return; }
  if (!customer.isActive) { res.json({ reason: "SUSPENDED", customer: true, subscription: null }); return; }

  const [sub] = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.tenantId, tenantId), eq(subscriptionsTable.customerId, customer.id)))
    .orderBy(desc(subscriptionsTable.expiresAt)).limit(1);

  if (!sub) { res.json({ reason: "NEW", customer: true, subscription: null }); return; }

  const subOut = { id: sub.id, status: sub.status, expiresAt: sub.expiresAt, planId: sub.planId };
  if (sub.status === "SUSPENDED") { res.json({ reason: "SUSPENDED", customer: true, subscription: subOut }); return; }

  const graceEndsAt = sub.expiresAt.getTime() + graceHours * 3600_000;
  const expired = sub.status === "EXPIRED" || sub.status === "CANCELLED" || sub.expiresAt.getTime() < Date.now();
  if (expired && Date.now() >= graceEndsAt) { res.json({ reason: "EXPIRED", customer: true, subscription: subOut }); return; }

  res.json({ reason: "ACTIVE", customer: true, subscription: subOut });
});

router.post("/portal/auth/login", async (_req, res) => {
  // Identifier-only login is account takeover; a tenant OTP provider is required.
  res.status(501).json({ error: "Customer sign-in requires an enabled OTP provider" });
});
router.post("/portal/auth/refresh", async (req, res) => {
  const raw = req.body?.refreshToken;
  if (typeof raw !== "string") { res.status(400).json({ error: "refreshToken is required" }); return; }
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const [record] = await db.select().from(customerPortalRefreshTokensTable).where(and(eq(customerPortalRefreshTokensTable.tokenHash, tokenHash), isNull(customerPortalRefreshTokensTable.revokedAt), gt(customerPortalRefreshTokensTable.expiresAt, new Date()))).limit(1);
  if (!record) { res.status(401).json({ error: "Invalid refresh token" }); return; }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, record.customerId)).limit(1);
  if (!customer || !customer.isActive) { res.status(401).json({ error: "Customer unavailable" }); return; }
  res.json({ accessToken: signCustomerAccessToken(token(customer)), expiresIn: 900, tokenType: "Bearer" });
});
router.get("/portal/me", requireCustomerAuth, async (req, res) => {
  const [customer] = await db.select().from(customersTable).where(and(eq(customersTable.id, req.customer!.id), eq(customersTable.tenantId, req.customer!.tenantId))).limit(1);
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [[wallet], [bonga]] = await Promise.all([db.select().from(walletsTable).where(eq(walletsTable.customerId, customer.id)).limit(1), db.select().from(bongaAccountsTable).where(eq(bongaAccountsTable.customerId, customer.id)).limit(1)]);
  res.json({ ...customer, wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null, bonga: bonga ? { balance: bonga.balance, lifetimeEarned: bonga.lifetimeEarned } : null });
});
router.get("/portal/dashboard", requireCustomerAuth, async (req, res) => {
  const id = req.customer!.id;
  const [[activeSession], [wallet], [loyalty], sessions] = await Promise.all([db.select().from(hotspotSessionsTable).where(and(eq(hotspotSessionsTable.customerId, id), isNull(hotspotSessionsTable.endedAt))).limit(1), db.select().from(walletsTable).where(eq(walletsTable.customerId, id)).limit(1), db.select().from(bongaAccountsTable).where(eq(bongaAccountsTable.customerId, id)).limit(1), db.select({ count: sql<number>`count(*)` }).from(hotspotSessionsTable).where(eq(hotspotSessionsTable.customerId, id))]);
  res.json({ activeSession: activeSession ?? null, wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null, loyalty: loyalty ? { balance: loyalty.balance, lifetimeEarned: loyalty.lifetimeEarned } : null, recentSessionCount: Number(sessions[0]?.count ?? 0) });
});
router.get("/portal/sessions/current", requireCustomerAuth, async (req, res) => {
  const [session] = await db.select().from(hotspotSessionsTable).where(and(eq(hotspotSessionsTable.customerId, req.customer!.id), isNull(hotspotSessionsTable.endedAt))).limit(1);
  res.json({ session: session ? { ...session, durationSeconds: Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000)) } : null });
});
router.get("/portal/sessions/history", requireCustomerAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  res.json(await db.select().from(hotspotSessionsTable).where(eq(hotspotSessionsTable.customerId, req.customer!.id)).orderBy(desc(hotspotSessionsTable.startedAt)).limit(limit));
});
router.get("/portal/loyalty", requireCustomerAuth, async (req, res) => {
  const [account] = await db.select().from(bongaAccountsTable).where(eq(bongaAccountsTable.customerId, req.customer!.id)).limit(1);
  if (!account) { res.json({ balance: 0, lifetimeEarned: 0, transactions: [] }); return; }
  const transactions = await db.select().from(bongaTransactionsTable).where(eq(bongaTransactionsTable.bongaAccountId, account.id)).orderBy(desc(bongaTransactionsTable.createdAt)).limit(50);
  res.json({ balance: account.balance, lifetimeEarned: account.lifetimeEarned, transactions });
});
router.post("/portal/payments/stk-push", optionalCustomerAuth, async (req, res) => {
  const { planId, phone } = req.body ?? {};
  if (typeof planId !== "string" || typeof phone !== "string" || !PHONE.test(phone)) { res.status(400).json({ error: "A valid planId and Kenyan M-PESA phone are required" }); return; }
  const [plan] = await db.select().from(servicePlansTable).where(and(eq(servicePlansTable.id, planId), eq(servicePlansTable.type, "HOTSPOT"), eq(servicePlansTable.isActive, true))).limit(1);
  if (!plan) { res.status(404).json({ error: "Package not found" }); return; }
  let customer: typeof customersTable.$inferSelect | undefined;
  if (req.customer) [customer] = await db.select().from(customersTable).where(and(eq(customersTable.id, req.customer.id), eq(customersTable.tenantId, plan.tenantId))).limit(1);
  if (!customer) { [customer] = await db.select().from(customersTable).where(and(eq(customersTable.tenantId, plan.tenantId), eq(customersTable.phone, phone))).limit(1); if (!customer) [customer] = await db.insert(customersTable).values({ tenantId: plan.tenantId, firstName: "Customer", lastName: phone.slice(-4), phone }).returning(); }
  const [push] = await db.insert(stkPushRequestsTable).values({ tenantId: plan.tenantId, customerId: customer.id, planId: plan.id, phone, amount: plan.price, checkoutRequestId: crypto.randomUUID() }).returning();
  // The verified M-PESA callback, not this route, must mark payment complete.
  res.status(201).json(pushStatus(push));
});
router.get("/portal/payments/stk-push/:id", async (req, res) => {
  const [push] = await db.select().from(stkPushRequestsTable).where(eq(stkPushRequestsTable.id, req.params.id)).limit(1);
  if (!push) { res.status(404).json({ error: "Payment request not found" }); return; }
  res.json(pushStatus(push));
});
export default router;
