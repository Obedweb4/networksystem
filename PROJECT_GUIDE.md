# PulseNet Billing & Network Operations Platform

## Applications

- **Admin dashboard**: staff manage customers, plans, invoices, vouchers, subscriptions, routers, alerts, and billing operations.
- **Customer portal**: customers log in, view packages, purchase service, view sessions, manage profiles, wallet, and loyalty features.
- **API server**: protected Express API that applies business rules, talks to PostgreSQL and reads RouterOS data.
- **MikroTik integration**: resilient RouterOS API client for monitoring, PPPoE/Hotspot session counts, provisioning, suspension, and expiry enforcement.
- **Captive portal**: Router-hosted Hotspot login assets that trigger device captive-network detection.

## AI Network Analyst

The Admin Dashboard has an AI Network Analyst panel. It is an administrator-only operational analyst, not an autonomous router controller.

- Collects live CPU, memory, connected PPPoE/Hotspot users and interface traffic samples from enabled routers.
- Refreshes the live traffic chart every 10 seconds, retaining the latest 24 samples while the page is open.
- Scores network health from router reachability, router load, unresolved alerts, expiring subscriptions, and overdue invoices.
- Gives actions such as checking an unreachable router, reviewing high load before peak time, sending renewal reminders, and following up overdue accounts.
- Uses tenant-scoped server data only. It does not expose RouterOS credentials to the browser.

The exact permissions and safety boundary are in `AI_ANALYST_ROLE.md`.

## Expiry enforcement

On API startup and every 60 seconds, the server finds active subscriptions past `expiresAt` that have a provisioning mapping. It disables the corresponding PPPoE secret or Hotspot user, removes active sessions, then marks the subscription `EXPIRED`. A router outage leaves the record active so the next sweep can retry.

## Security model

- Staff routes require a bearer token and are scoped to the staff member's tenant.
- Customer routes use separate customer authentication.
- The analyst is read-only by design; existing staff tools execute changes explicitly.
- Before production, restrict CORS, use HTTPS, store `JWT_SECRET` in a secret manager, and encrypt router API secrets at rest.

## Admin authentication & RBAC

- **Roles** (`lib/db/src/schema/users.ts`): `SUPER_ADMIN` (platform-wide, all tenants), `BUSINESS_OWNER`, `STAFF`, `TECHNICIAN`, `RESELLER` — all tenant-scoped. `requireRole(...)` in `middlewares/auth.ts` gates routes by role.
- **Self-registration** (`POST /auth/register`): creates a tenant + owner account with `status: PENDING_APPROVAL` and no role. It cannot log in until approved. A Super Admin can approve any tenant's pending users (`GET /auth/pending-users`, `POST /auth/approve-user`, `POST /auth/reject-user`); a Business Owner can only approve within their own tenant.
- **Trusted bootstrap** (`POST /auth/signup`, `scripts/src/seed-initial-tenant.ts`): creates an active owner/admin immediately, no approval step. Use this to stand up the first tenant/Super Admin, not for public sign-ups.
- **Account lockout**: 5 failed password attempts locks the account for 15 minutes (`failedLoginAttempts` / `lockedUntil` on `users`).
- **Rate limiting**: per-IP limits on login, register, forgot-password, and 2FA verification (`middlewares/rate-limit.ts`).
- **2FA**: optional TOTP (`POST /auth/2fa/setup`, `/verify`, `/disable`). When enabled, `POST /auth/login` returns `{ requires2FA: true, tempToken }` instead of tokens; complete with `POST /auth/login/2fa`.
- **Sessions/devices**: each refresh token records `userAgent`/`ipAddress`/`lastUsedAt`. List with `GET /auth/sessions`, revoke one with `POST /auth/sessions/:id/revoke`.
- **Password reset**: `POST /auth/forgot-password` / `POST /auth/reset-password`, backed by `password_reset_tokens`. Resetting a password revokes all of that user's sessions.
- **Audit log**: `audit_logs` table records logins (success/failure/lockout), registrations, password resets, 2FA changes, session revocations, and approvals via `lib/audit-log.ts`.
- **Not yet built**: email/SMS/WhatsApp delivery for verification and reset codes (needs a real provider — see `.env.example`). Frontend for login/register/forgot-password/setup-wizard is now in place (see below); payment/SMS gateway *configuration* itself is not.

### Admin frontend pages added
`/login` (redesigned, glass card, 2FA-aware), `/register` (multi-step self-registration), `/forgot-password`, `/reset-password`, `/pending-approvals` (Super Admin/Business Owner review queue), `/setup` (first-login wizard). These call the new endpoints directly via `src/lib/auth-api.ts` (hand-written fetch helpers) since they aren't in the generated OpenAPI client yet — re-run Orval codegen once `lib/api-spec/openapi.yaml` is updated with these paths to get typed react-query hooks instead.

## Deployment

See `DEPLOYMENT.md` and `.env.example`. You need PostgreSQL, a persistent API process, database schema setup, RouterOS API access, and customised Hotspot files.
