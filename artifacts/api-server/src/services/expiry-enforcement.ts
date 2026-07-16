import { and, eq, lt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  provisioningMappingsTable,
  routersTable,
  subscriptionsTable,
} from "@workspace/db/schema";
import { MikroTikClient } from "@workspace/mikrotik";
import { logger } from "../lib/logger";

/**
 * Enforces billing expiry on the router instead of merely changing the
 * subscription status in Postgres. A successful sweep disables either a
 * PPPoE secret or Hotspot user (blocks reconnects), terminates every current
 * session for that account, then marks the billing record EXPIRED.
 */
export async function enforceExpiredSubscriptions(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select({
      subscriptionId: subscriptionsTable.id,
      routerUsername: provisioningMappingsTable.routerUsername,
      router: routersTable,
    })
    .from(subscriptionsTable)
    .innerJoin(
      provisioningMappingsTable,
      eq(provisioningMappingsTable.subscriptionId, subscriptionsTable.id),
    )
    .innerJoin(routersTable, eq(routersTable.id, provisioningMappingsTable.routerId))
    .where(
      and(
        eq(subscriptionsTable.status, "ACTIVE"),
        lt(subscriptionsTable.expiresAt, now),
        eq(routersTable.isActive, true),
      ),
    );

  for (const item of expired) {
    const client = new MikroTikClient({
      id: item.router.id,
      tenantId: item.router.tenantId,
      name: item.router.name,
      ipAddress: item.router.ipAddress,
      apiPort: item.router.apiPort ?? 8728,
      apiUsername: item.router.apiUsername,
      apiSecret: item.router.apiSecret,
    });

    try {
      const connection = await client.connect();
      if (!connection.success) {
        logger.error({ subscriptionId: item.subscriptionId, routerId: item.router.id, error: connection.error }, "Expiry enforcement could not reach router");
        continue;
      }

      const pppUsers = await client.run("/ppp/secret", "print", { name: item.routerUsername });
      if (!pppUsers.success) throw new Error(pppUsers.error ?? "Could not locate subscriber account");
      const pppUser = (Array.isArray(pppUsers.data) ? pppUsers.data[0] : pppUsers.data) as Record<string, unknown> | undefined;
      const pppUserId = pppUser?.[".id"] as string | undefined;

      const userPath = pppUserId ? "/ppp/secret" : "/ip/hotspot/user";
      const activePath = pppUserId ? "/ppp/active" : "/ip/hotspot/active";
      let userId = pppUserId;
      if (!userId) {
        const hotspotUsers = await client.run(userPath, "print", { name: item.routerUsername });
        if (!hotspotUsers.success) throw new Error(hotspotUsers.error ?? "Could not locate Hotspot user");
        const hotspotUser = (Array.isArray(hotspotUsers.data) ? hotspotUsers.data[0] : hotspotUsers.data) as Record<string, unknown> | undefined;
        userId = hotspotUser?.[".id"] as string | undefined;
      }
      if (!userId) throw new Error(`Router user '${item.routerUsername}' no longer exists`);

      const disabled = await client.run(userPath, "set", { ".id": userId, disabled: "yes" });
      if (!disabled.success) throw new Error(disabled.error ?? "Could not disable subscriber account");

      const sessions = await client.run(activePath, "print", { name: item.routerUsername });
      if (!sessions.success) throw new Error(sessions.error ?? "Could not check active subscriber sessions");
      const activeSessions = (Array.isArray(sessions.data) ? sessions.data : sessions.data ? [sessions.data] : []) as Array<Record<string, unknown>>;
      for (const session of activeSessions) {
        const sessionId = session[".id"] as string | undefined;
        if (!sessionId) continue;
        const removed = await client.run(activePath, "remove", { ".id": sessionId });
        if (!removed.success) throw new Error(removed.error ?? "Could not terminate active session");
      }

      await db
        .update(subscriptionsTable)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(and(eq(subscriptionsTable.id, item.subscriptionId), eq(subscriptionsTable.status, "ACTIVE")));
      logger.info({ subscriptionId: item.subscriptionId, username: item.routerUsername, terminatedSessions: activeSessions.length }, "Expired subscription enforced");
    } catch (error) {
      logger.error({ err: error, subscriptionId: item.subscriptionId, routerId: item.router.id }, "Expiry enforcement failed; it will retry on the next sweep");
    } finally {
      await client.disconnect();
    }
  }
}

/** Starts a non-overlapping one-minute expiry sweep for this API process. */
export function startExpiryEnforcement(intervalMs = 60_000): void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await enforceExpiredSubscriptions();
    } finally {
      running = false;
    }
  };
  void sweep();
  setInterval(() => void sweep(), intervalMs).unref();
}
