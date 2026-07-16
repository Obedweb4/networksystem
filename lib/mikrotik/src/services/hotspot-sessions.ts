import { MikroTikClient } from "../client";
import type { RouterConfig } from "../types";

/**
 * Active Hotspot Session Counting Service for PulseNet Billing
 *
 * Responsibilities:
 * - Count LIVE hotspot sessions directly from MikroTik (/ip/hotspot/active),
 *   never from the hotspot_sessions DB table, since that table can drift
 *   from what's actually connected on the router (e.g. missed "logged out"
 *   events, router reboots, etc).
 * - Fail gracefully per-router: an unreachable router contributes 0 to the
 *   total instead of failing the whole dashboard request.
 *
 * NOT responsible for:
 * - Persisting session history (see hotspot_sessions table for that)
 * - Hotspot user provisioning
 */

/**
 * Count active (currently connected) hotspot sessions on a single router by
 * querying RouterOS `/ip/hotspot/active print` directly.
 *
 * Opens a short-lived connection dedicated to this call and always closes it
 * afterwards - callers should not hold a shared/long-lived client for this.
 *
 * @returns 0 if the router is unreachable or the command fails (logged, not thrown)
 */
export async function countActiveHotspotSessions(router: RouterConfig): Promise<number> {
  const client = new MikroTikClient(router);

  try {
    const connectResult = await client.connect();
    if (!connectResult.success) {
      console.error(
        `[mikrotik] Router "${router.name}" (${router.id}) unreachable while counting active hotspot sessions: ${connectResult.message ?? connectResult.error}`
      );
      return 0;
    }

    const activeResult = await client.run("/ip/hotspot/active", "print", {});
    if (!activeResult.success) {
      console.error(
        `[mikrotik] Router "${router.name}" (${router.id}) failed to return active hotspot sessions: ${activeResult.message ?? activeResult.error}`
      );
      return 0;
    }

    const sessions = Array.isArray(activeResult.data)
      ? activeResult.data
      : activeResult.data
        ? [activeResult.data]
        : [];

    return sessions.length;
  } catch (error) {
    console.error(
      `[mikrotik] Unexpected error counting active hotspot sessions for router "${router.name}" (${router.id}):`,
      error
    );
    return 0;
  } finally {
    await client.disconnect();
  }
}

/**
 * Count active hotspot sessions across multiple routers (e.g. all routers
 * for a tenant) in parallel, tolerating individual router failures.
 */
export async function countActiveHotspotUsers(routers: RouterConfig[]): Promise<number> {
  if (routers.length === 0) return 0;
  const counts = await Promise.all(routers.map((r) => countActiveHotspotSessions(r)));
  return counts.reduce((sum, c) => sum + c, 0);
}
