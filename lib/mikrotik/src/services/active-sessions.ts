import { MikroTikClient } from "../client";
import type { RouterConfig } from "../types";

/**
 * Active Session Counting Service for PulseNet Billing
 *
 * Responsibilities:
 * - Count LIVE PPPoE sessions directly from MikroTik (/ppp/active), never
 *   from the /ppp/secret (configured user) list, since a configured secret
 *   may not currently be connected.
 * - Fail gracefully per-router: an unreachable router contributes 0 to the
 *   total instead of failing the whole dashboard request.
 *
 * NOT responsible for:
 * - Persisting session history (see hotspot_sessions table for that)
 * - Provisioning / deprovisioning PPPoE accounts
 */

/**
 * Count active (currently connected) PPPoE sessions on a single router by
 * querying RouterOS `/ppp/active print` directly.
 *
 * Opens a short-lived connection dedicated to this call and always closes it
 * afterwards - callers should not hold a shared/long-lived client for this.
 *
 * @returns 0 if the router is unreachable or the command fails (logged, not thrown)
 */
export async function countActivePppoeSessions(router: RouterConfig): Promise<number> {
  const client = new MikroTikClient(router);

  try {
    const connectResult = await client.connect();
    if (!connectResult.success) {
      console.error(
        `[mikrotik] Router "${router.name}" (${router.id}) unreachable while counting active PPPoE sessions: ${connectResult.message ?? connectResult.error}`
      );
      return 0;
    }

    const activeResult = await client.run("/ppp/active", "print", {});
    if (!activeResult.success) {
      console.error(
        `[mikrotik] Router "${router.name}" (${router.id}) failed to return active PPP sessions: ${activeResult.message ?? activeResult.error}`
      );
      return 0;
    }

    const sessions = Array.isArray(activeResult.data)
      ? activeResult.data
      : activeResult.data
        ? [activeResult.data]
        : [];

    // /ppp/active includes both pppoe and other ppp service types (e.g. pptp, l2tp);
    // only count entries whose service is pppoe (or unspecified, which RouterOS
    // reports for plain PPPoE sessions on some firmware versions).
    return sessions.filter((s) => {
      const service = (s as Record<string, unknown>).service;
      return service === undefined || service === "pppoe";
    }).length;
  } catch (error) {
    console.error(
      `[mikrotik] Unexpected error counting active PPPoE sessions for router "${router.name}" (${router.id}):`,
      error
    );
    return 0;
  } finally {
    await client.disconnect();
  }
}

/**
 * Count active PPPoE sessions across multiple routers (e.g. all routers for
 * a tenant) in parallel, tolerating individual router failures.
 */
export async function countActivePppoeUsers(routers: RouterConfig[]): Promise<number> {
  if (routers.length === 0) return 0;
  const counts = await Promise.all(routers.map((r) => countActivePppoeSessions(r)));
  return counts.reduce((sum, c) => sum + c, 0);
}
