import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { voucherBatchesTable, vouchersTable, servicePlansTable } from "@workspace/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import {
  ListVoucherBatchesQueryParams, CreateVoucherBatchBody, GetVoucherBatchParams,
  ListVouchersParams, ListVouchersQueryParams, RedeemVoucherBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function genCode(prefix: string, len = 8): string {
  return (prefix + crypto.randomBytes(6).toString("hex").toUpperCase()).slice(0, prefix.length + len);
}

router.get("/voucher-batches", requireAuth, async (req, res) => {
  const parse = ListVoucherBatchesQueryParams.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { tenantId } = req.user!;
  const conditions = [eq(voucherBatchesTable.tenantId, tenantId)];
  if (parse.data.isActive !== undefined) conditions.push(eq(voucherBatchesTable.isActive, parse.data.isActive));
  const rows = await db.select({ batch: voucherBatchesTable, planName: servicePlansTable.name })
    .from(voucherBatchesTable).leftJoin(servicePlansTable, eq(voucherBatchesTable.planId, servicePlansTable.id))
    .where(and(...conditions)).orderBy(desc(voucherBatchesTable.createdAt));
  res.json(rows.map(r => ({ ...r.batch, planName: r.planName })));
});

router.post("/voucher-batches", requireAuth, async (req, res) => {
  const parse = CreateVoucherBatchBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation failed", details: parse.error.issues }); return; }
  const { tenantId } = req.user!;
  const prefix = parse.data.codePrefix ?? "PN";
  const [batch] = await db.insert(voucherBatchesTable).values({ tenantId, planId: parse.data.planId, name: parse.data.name, codePrefix: prefix, quantity: parse.data.quantity, unitPrice: parse.data.unitPrice, costPrice: parse.data.costPrice }).returning();
  const codes = Array.from({ length: parse.data.quantity }, () => ({ batchId: batch!.id, code: genCode(prefix) }));
  await db.insert(vouchersTable).values(codes);
  const [plan] = await db.select().from(servicePlansTable).where(eq(servicePlansTable.id, parse.data.planId)).limit(1);
  res.status(201).json({ ...batch, planName: plan?.name });
});

router.get("/voucher-batches/:id", requireAuth, async (req, res) => {
  const parse = GetVoucherBatchParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { tenantId } = req.user!;
  const [row] = await db.select({ batch: voucherBatchesTable, planName: servicePlansTable.name })
    .from(voucherBatchesTable).leftJoin(servicePlansTable, eq(voucherBatchesTable.planId, servicePlansTable.id))
    .where(and(eq(voucherBatchesTable.id, parse.data.id), eq(voucherBatchesTable.tenantId, tenantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Batch not found" }); return; }
  const [stats] = await db.select({
    unusedCount: sql<number>`SUM(CASE WHEN status = 'UNUSED' THEN 1 ELSE 0 END)`,
    usedCount: sql<number>`SUM(CASE WHEN status = 'USED' THEN 1 ELSE 0 END)`,
    expiredCount: sql<number>`SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END)`,
  }).from(vouchersTable).where(eq(vouchersTable.batchId, parse.data.id));
  res.json({ ...row.batch, planName: row.planName, unusedCount: Number(stats?.unusedCount ?? 0), usedCount: Number(stats?.usedCount ?? 0), expiredCount: Number(stats?.expiredCount ?? 0) });
});

router.get("/voucher-batches/:id/vouchers", requireAuth, async (req, res) => {
  const paramParse = ListVouchersParams.safeParse(req.params);
  const queryParse = ListVouchersQueryParams.safeParse(req.query);
  if (!paramParse.success || !queryParse.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { page, limit, status } = queryParse.data;
  const offset = (page - 1) * limit;
  const conditions = [eq(vouchersTable.batchId, paramParse.data.id)];
  if (status) conditions.push(eq(vouchersTable.status, status));
  const [data, [{ total }]] = await Promise.all([
    db.select().from(vouchersTable).where(and(...conditions)).orderBy(desc(vouchersTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(vouchersTable).where(and(...conditions)),
  ]);
  res.json({ data, total: Number(total), page, limit });
});

router.post("/vouchers/redeem", requireAuth, async (req, res) => {
  const parse = RedeemVoucherBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation failed", details: parse.error.issues }); return; }
  const [voucher] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, parse.data.code)).limit(1);
  if (!voucher) { res.status(404).json({ error: "Voucher not found" }); return; }
  if (voucher.status !== "UNUSED") { res.status(400).json({ error: `Voucher is ${voucher.status.toLowerCase()}` }); return; }
  const [updated] = await db.update(vouchersTable).set({ status: "USED", usedByCustomerId: parse.data.customerId, usedAt: new Date() }).where(eq(vouchersTable.id, voucher.id)).returning();
  res.json(updated);
});

export default router;
