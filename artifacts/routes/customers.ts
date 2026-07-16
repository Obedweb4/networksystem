import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  customersTable, subscriptionsTable, servicePlansTable,
  walletsTable, walletTransactionsTable, bongaAccountsTable, bongaTransactionsTable,
} from "@workspace/db/schema";
import { eq, and, or, ilike, sql, count, desc } from "drizzle-orm";
import {
  ListCustomersQueryParams, CreateCustomerBody, GetCustomerParams,
  UpdateCustomerParams, UpdateCustomerBody, DeleteCustomerParams,
  GetCustomerWalletParams, GetCustomerBongaParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/customers", requireAuth, async (req, res) => {
  const parse = ListCustomersQueryParams.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Invalid query", details: parse.error.issues }); return; }
  const { page, limit, search, isActive } = parse.data;
  const { tenantId } = req.user!;
  const offset = (page - 1) * limit;
  const conditions = [eq(customersTable.tenantId, tenantId)];
  if (isActive !== undefined) conditions.push(eq(customersTable.isActive, isActive));
  if (search) conditions.push(or(ilike(customersTable.firstName, `%${search}%`), ilike(customersTable.lastName, `%${search}%`), ilike(customersTable.phone, `%${search}%`))!);
  const [data, [{ total }]] = await Promise.all([
    db.select().from(customersTable).where(and(...conditions)).orderBy(desc(customersTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(customersTable).where(and(...conditions)),
  ]);
  res.json({ data, total: Number(total), page, limit });
});

router.post("/customers", requireAuth, async (req, res) => {
  const parse = CreateCustomerBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation failed", details: parse.error.issues }); return; }
  const { tenantId } = req.user!;
  const [customer] = await db.insert(customersTable).values({ ...parse.data, tenantId }).returning();
  await db.insert(walletsTable).values({ customerId: customer!.id });
  await db.insert(bongaAccountsTable).values({ customerId: customer!.id });
  res.status(201).json(customer);
});

router.get("/customers/:id", requireAuth, async (req, res) => {
  const parse = GetCustomerParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { tenantId } = req.user!;
  const [customer] = await db.select().from(customersTable).where(and(eq(customersTable.id, parse.data.id), eq(customersTable.tenantId, tenantId))).limit(1);
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [activeSub] = await db
    .select({ sub: subscriptionsTable, planName: servicePlansTable.name })
    .from(subscriptionsTable)
    .leftJoin(servicePlansTable, eq(subscriptionsTable.planId, servicePlansTable.id))
    .where(and(eq(subscriptionsTable.customerId, customer.id), eq(subscriptionsTable.status, "ACTIVE")))
    .limit(1);
  res.json({ ...customer, activeSubscription: activeSub ? { ...activeSub.sub, planName: activeSub.planName } : null });
});

router.put("/customers/:id", requireAuth, async (req, res) => {
  const paramParse = UpdateCustomerParams.safeParse(req.params);
  const bodyParse = UpdateCustomerBody.safeParse(req.body);
  if (!paramParse.success || !bodyParse.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const { tenantId } = req.user!;
  const [updated] = await db.update(customersTable).set({ ...bodyParse.data, updatedAt: new Date() })
    .where(and(eq(customersTable.id, paramParse.data.id), eq(customersTable.tenantId, tenantId))).returning();
  if (!updated) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(updated);
});

router.delete("/customers/:id", requireAuth, async (req, res) => {
  const parse = DeleteCustomerParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { tenantId } = req.user!;
  const [deleted] = await db.update(customersTable).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(customersTable.id, parse.data.id), eq(customersTable.tenantId, tenantId))).returning();
  if (!deleted) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ success: true });
});

router.get("/customers/:id/wallet", requireAuth, async (req, res) => {
  const parse = GetCustomerWalletParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.customerId, parse.data.id)).limit(1);
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  const txns = await db.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.walletId, wallet.id)).orderBy(desc(walletTransactionsTable.createdAt)).limit(20);
  res.json({ id: wallet.id, balance: Number(wallet.balance), currency: wallet.currency, transactions: txns.map(t => ({ ...t, amount: Number(t.amount), balanceAfter: Number(t.balanceAfter) })) });
});

router.get("/customers/:id/bonga", requireAuth, async (req, res) => {
  const parse = GetCustomerBongaParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [acct] = await db.select().from(bongaAccountsTable).where(eq(bongaAccountsTable.customerId, parse.data.id)).limit(1);
  if (!acct) { res.status(404).json({ error: "Bonga account not found" }); return; }
  const txns = await db.select().from(bongaTransactionsTable).where(eq(bongaTransactionsTable.bongaAccountId, acct.id)).orderBy(desc(bongaTransactionsTable.createdAt)).limit(20);
  res.json({ id: acct.id, balance: acct.balance, lifetimeEarned: acct.lifetimeEarned, transactions: txns });
});

/** Credit a customer's prepaid wallet from the admin Services screen. */
router.post("/customers/:id/recharge", requireAuth, async (req, res) => {
  const amount = Number(req.body?.amount);
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "Amount must be greater than zero" }); return; }
  const [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, String(req.params.id)), eq(customersTable.tenantId, req.user!.tenantId))).limit(1);
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.customerId, customer.id)).limit(1);
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  const balance = (Number(wallet.balance) + amount).toFixed(2);
  await db.transaction(async (tx) => {
    await tx.update(walletsTable).set({ balance, updatedAt: new Date() }).where(eq(walletsTable.id, wallet.id));
    await tx.insert(walletTransactionsTable).values({ walletId: wallet.id, type: "credit", amount: amount.toFixed(2), balanceAfter: balance, description: `Admin recharge${reference ? ` (${reference})` : ""}` });
  });
  res.status(201).json({ customerId: customer.id, balance: Number(balance), message: "Wallet recharged" });
});

/** Extend an active subscription. This records a refill without changing plan speed or price. */
router.post("/customers/:id/refill", requireAuth, async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) { res.status(400).json({ error: "Days must be an integer from 1 to 365" }); return; }
  const [customer] = await db.select().from(customersTable)
    .where(and(eq(customersTable.id, String(req.params.id)), eq(customersTable.tenantId, req.user!.tenantId))).limit(1);
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  const [subscription] = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.customerId, customer.id), eq(subscriptionsTable.status, "ACTIVE")))
    .orderBy(desc(subscriptionsTable.expiresAt)).limit(1);
  if (!subscription) { res.status(409).json({ error: "Customer has no active subscription to refill" }); return; }
  const base = subscription.expiresAt > new Date() ? subscription.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(subscriptionsTable).set({ expiresAt, updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, subscription.id)).returning();
  res.json({ subscription: updated, message: `Service refilled for ${days} day${days === 1 ? "" : "s"}` });
});

export default router;
