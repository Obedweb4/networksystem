import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationTemplatesTable, notificationLogsTable, customersTable } from "@workspace/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import {
  CreateNotificationTemplateBody, UpdateNotificationTemplateParams, UpdateNotificationTemplateBody,
  DeleteNotificationTemplateParams, ListNotificationLogsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/notification-templates", requireAuth, async (req, res) => {
  const { tenantId } = req.user!;
  const data = await db.select().from(notificationTemplatesTable).where(eq(notificationTemplatesTable.tenantId, tenantId)).orderBy(desc(notificationTemplatesTable.createdAt));
  res.json(data);
});

router.post("/notification-templates", requireAuth, async (req, res) => {
  const parse = CreateNotificationTemplateBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Validation failed", details: parse.error.issues }); return; }
  const { tenantId } = req.user!;
  const [tmpl] = await db.insert(notificationTemplatesTable).values({ tenantId, ...parse.data, variables: parse.data.variables ?? [] }).returning();
  res.status(201).json(tmpl);
});

router.patch("/notification-templates/:id", requireAuth, async (req, res) => {
  return notificationTemplateUpdate(req, res);
});

router.put("/notification-templates/:id", requireAuth, async (req, res) => {
  return notificationTemplateUpdate(req, res);
});

async function notificationTemplateUpdate(req: any, res: any) {
  const paramParse = UpdateNotificationTemplateParams.safeParse(req.params);
  const bodyParse = UpdateNotificationTemplateBody.safeParse(req.body);
  if (!paramParse.success || !bodyParse.success) { res.status(400).json({ error: "Validation failed" }); return; }
  const { tenantId } = req.user!;
  const [updated] = await db.update(notificationTemplatesTable).set({ ...bodyParse.data, updatedAt: new Date() })
    .where(and(eq(notificationTemplatesTable.id, paramParse.data.id), eq(notificationTemplatesTable.tenantId, tenantId))).returning();
  if (!updated) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(updated);
}

router.delete("/notification-templates/:id", requireAuth, async (req, res) => {
  const parse = DeleteNotificationTemplateParams.safeParse(req.params);
  if (!parse.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const { tenantId } = req.user!;
  await db.delete(notificationTemplatesTable).where(and(eq(notificationTemplatesTable.id, parse.data.id), eq(notificationTemplatesTable.tenantId, tenantId)));
  res.json({ success: true });
});

router.get("/notification-logs", requireAuth, async (req, res) => {
  const parse = ListNotificationLogsQueryParams.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const { tenantId } = req.user!;
  const { page, limit, customerId, status } = parse.data;
  const offset = (page - 1) * limit;
  const conditions = [eq(notificationLogsTable.tenantId, tenantId)];
  if (customerId) conditions.push(eq(notificationLogsTable.customerId, customerId));
  if (status) conditions.push(eq(notificationLogsTable.status, status));
  const [rows, [{ total }]] = await Promise.all([
    db.select({ log: notificationLogsTable, customerName: sql<string | null>`${customersTable.firstName} || ' ' || ${customersTable.lastName}` })
      .from(notificationLogsTable).leftJoin(customersTable, eq(notificationLogsTable.customerId, customersTable.id))
      .where(and(...conditions)).orderBy(desc(notificationLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(notificationLogsTable).where(and(...conditions)),
  ]);
  res.json({ data: rows.map(r => ({ ...r.log, customerName: r.customerName })), total: Number(total), page, limit });
});

// Send a notification — creates a log entry with SENT status
router.post("/notifications/send", requireAuth, async (req, res) => {
  const { tenantId } = req.user!;
  const { customerId, channel, recipient, templateId } = req.body;

  if (!channel || !recipient) {
    res.status(400).json({ error: "channel and recipient are required" });
    return;
  }

  const validChannels = ["SMS", "EMAIL", "WHATSAPP"];
  if (!validChannels.includes(channel)) {
    res.status(400).json({ error: `channel must be one of: ${validChannels.join(", ")}` });
    return;
  }

  const [log] = await db.insert(notificationLogsTable).values({
    tenantId,
    customerId: customerId ?? null,
    templateId: templateId ?? null,
    channel,
    recipient,
    status: "SENT",
    sentAt: new Date(),
  }).returning();

  res.status(201).json(log);
});

export default router;
