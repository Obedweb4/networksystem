import { Router, type IRouter } from "express";
import * as zod from "zod";
import { db } from "@workspace/db";
import { tenantsTable, ROLES } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/tenant", requireAuth, async (req, res) => {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.user!.tenantId)).limit(1);
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ tenant });
});

const UpdateTenantBody = zod.object({ name: zod.string().min(2).optional(), logoUrl: zod.url().optional().or(zod.literal("")) });

router.patch("/tenant", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.BUSINESS_OWNER), async (req, res) => {
  const parse = UpdateTenantBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid request", details: parse.error.issues }); return; }

  const [tenant] = await db.update(tenantsTable).set({ ...parse.data, updatedAt: new Date() })
    .where(eq(tenantsTable.id, req.user!.tenantId)).returning();
  res.json({ tenant });
});

router.post("/tenant/onboarding/complete", requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.BUSINESS_OWNER), async (req, res) => {
  const [tenant] = await db.update(tenantsTable).set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenantsTable.id, req.user!.tenantId)).returning();
  res.json({ tenant });
});

export default router;
