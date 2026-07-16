# PulseNet MikroTik captive portal

This folder is the RouterOS side of the captive portal. The web application in `artifacts/customer-portal` does not replace the MikroTik Hotspot login files: the router must serve `login.html` to unauthenticated clients for Android, iOS, Windows, and browsers to recognise the network as captive.

## What `login.html` does now

`login.html` is still a plain RouterOS-templated static page (no build step, no framework) — but it now does two things instead of one:

1. **Shows a 3-column package grid and lets a guest buy a package with M-PESA, no login required.** It fetches `GET /portal/packages` and posts to `POST /portal/payments/stk-push` on the existing `api-server` — the exact same endpoints `artifacts/customer-portal` already uses. The phone number field only appears after a package is picked; a returning device that already entered a number gets it remembered (via `localStorage` on the captive page itself) with a "Change Number" option.
2. **Decides which banner to show, or whether to show itself at all**, via the new `GET /portal/device-status` endpoint (added to `portal.ts`, reusing only existing tables: `hotspot_sessions.macAddress` → `customers` → `subscriptions`):
   - **Active subscription** → banner only ("looks active, try reconnecting"), package grid stays hidden. A page load from an authorized, bound device shouldn't normally happen — this is the safety-net message for that edge case, since a static page can't force RouterOS to un-intercept it.
   - **New customer** (device never seen before) → grid shown, "Welcome" banner.
   - **Expired subscription past grace** → grid shown, "renew" banner.
   - **Suspended account** → grid hidden, "contact support" banner — no self-serve renewal.
   - **Unknown device** (not new, but this MAC has no purchase history) → grid shown, plus a "Verify your number" link that re-checks status by phone instead of MAC (reuses the same lookup the guest checkout already does).

The original RouterOS username/password/voucher login (chap-id MD5 challenge, `$(link-login-only)`, hidden `dst`/`popup` fields, `$(error)`) is **unchanged** — it's now under a collapsed "Already have a voucher or account? Log in" section so existing vouchers and PPPoE-hotspot credentials keep working exactly as before.

## Deploy

1. Identify the Hotspot server and profile in WinBox/WebFig.
2. Copy the **contents** of `hotspot/` to the router's `hotspot` directory (`Files` -> `hotspot`). The result must be `hotspot/login.html`, not `hotspot/hotspot/login.html`.
3. Replace the example profile name, gateway address, DNS name, and portal URL in `routeros/apply-after-customising.rsc`; replace the URL in `hotspot/alogin.html` too.
4. **In `hotspot/login.html`**, set the two constants near the top of the `<script>` block:
   - `TENANT_ID` — this tenant's ID (same value used elsewhere as `?tenantId=`).
   - `API_BASE_URL` — the public HTTPS URL of `api-server` (e.g. `https://api.pulsenet.co.ke`).
   - Optionally adjust `REQUIRE_DEVICE_VERIFICATION` and `GRACE_HOURS` (see comments in the file — `GRACE_HOURS` is display-only and does not extend actual network access; that's still enforced by the router-side expiry sweep).
5. **Add the captive DNS name's origin to `CORS_ORIGINS`** on `api-server` (e.g. `http://login.pulsenet.test`), or the package grid's `fetch()` calls will be blocked by CORS. This is in addition to the existing admin/customer-portal origins already there.
6. Import the customised script in a maintenance window, or run its commands one at a time in the RouterOS terminal.
7. Forget Wi-Fi on a test phone, reconnect, and wait up to 15 seconds. The operating system's captive-network panel should show the PulseNet page. Visiting an **HTTP** URL such as `http://neverssl.com` is a reliable manual fallback.

## Important notes

- Automatic opening is initiated by the client operating system; RouterOS can trigger it by intercepting unauthenticated HTTP traffic but cannot force a browser window to open on every device. HTTPS-only requests cannot be intercepted.
- Keep `dns-name` a plain hostname (not an `http://` URL) and make its DNS A record point to the Hotspot gateway. `allow-remote-requests=yes` is required only when this router provides DNS to clients.
- The login form uses RouterOS variables such as `$(link-login-only)`, `$(chap-id)`, and `$(mac)`. Do not process this file through a frontend build tool.
- The after-login page is redirected only after the RouterOS login succeeds. Use a publicly reachable HTTPS URL for the customer portal.
- **What this doesn't do**: a successful M-PESA payment on the captive page marks the subscription active in the database (same as `artifacts/customer-portal`'s existing purchase flow) — it does not itself bind the device on RouterOS. Getting online after paying still relies on whatever mechanism this deployment already uses to grant Hotspot access after a subscription is created (voucher issuance, RADIUS, or manual reconnection); this change does not add or alter that pipeline.

## Verification commands

```routeros
/ip hotspot profile print detail
/ip hotspot active print
/ip dns static print where name="login.pulsenet.test"
```

If the captive panel does not open, confirm the client received the Hotspot gateway as its DNS server and that it has not been bypassed by an IP binding, walled-garden rule, or remembered session cookie.
