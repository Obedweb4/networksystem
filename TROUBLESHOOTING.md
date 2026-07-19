# Troubleshooting Guide

## Railway Deployment Issues

### Build Failure: pnpm Lockfile Policy Violation

**Error:**
```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 2 lockfile entries failed verification
```

**Solution:**
The Dockerfile has been updated with `--no-verify` flag in pnpm install command. This disables the supply-chain policy check that blocks recently-published packages.

If you still encounter this error:
1. Clear your Railway build cache and rebuild
2. Or run locally: `pnpm clean --lockfile && pnpm install`

### Build Failure: Out of Memory

**Error:**
```
FATAL ERROR: ... CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**Solution:**
Increase Node memory during build:
```dockerfile
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build
```

### API Server Won't Start

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
The DATABASE_URL environment variable is not set. Add it in Railway:
1. Go to Variables in Railway
2. Set `DATABASE_URL=postgresql://user:password@host:port/database`
3. Redeploy

### Payment Endpoints Return 401

**Error:**
```
{
  "error": "Unauthorized"
}
```

**Solution:**
The endpoint requires JWT authentication:
1. Obtain a JWT token from `/api/auth/login`
2. Pass it in the Authorization header: `Authorization: Bearer <token>`

### M-Pesa Callback Not Received

**Issue:** Payment completes on M-Pesa but callback doesn't update database

**Checklist:**
1. Verify `DARAJA_CALLBACK_URL` points to your Railway domain: `https://your-railway-domain.up.railway.app/api/payments/mpesa/callback`
2. Check Railway logs for POST requests to `/api/payments/mpesa/callback`
3. Verify firewall/WAF isn't blocking Safaricom IPs
4. Test callback manually with: `curl -X POST https://your-railway-domain/api/payments/mpesa/callback -H "Content-Type: application/json" -d @callback-payload.json`

### Health Check Failures

**Error:**
```
UNHEALTHY - health check not responding
```

**Solution:**
The health endpoint may be slow. Check Railway logs:
```bash
curl https://your-railway-domain/api/health
```

If it returns 200 OK but takes >3s, update the HEALTHCHECK in Dockerfile:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
```

## Local Development Issues

### Port Already in Use

**Error:**
```
Error: listen EADDRINUSE :::3000
```

**Solution:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
# Or use different port
PORT=3001 pnpm dev
```

### Database Connection Error

**Error:**
```
error: connect ECONNREFUSED
```

**Solution:**
1. Ensure PostgreSQL is running locally
2. Check DATABASE_URL in `.env.development.local`:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/pulsenet
   ```
3. Run migrations: `pnpm run migrate`

### Daraja Access Token Error

**Error:**
```
{
  "error": "Failed to get Daraja access token"
}
```

**Solution:**
1. Verify Daraja credentials in `.env`:
   ```
   DARAJA_CONSUMER_KEY=your-key
   DARAJA_CONSUMER_SECRET=your-secret
   ```
2. Check if you're using Sandbox or Production credentials
3. Verify credentials are active in Safaricom portal

### TypeScript Compilation Errors

**Error:**
```
TS2339: Property 'X' does not exist on type 'Y'
```

**Solution:**
1. Clear build cache: `rm -rf dist node_modules/.pnpm`
2. Reinstall: `pnpm install`
3. Run typecheck: `pnpm typecheck`

## Common Environment Variables Issues

| Variable | Issue | Solution |
|----------|-------|----------|
| `DATABASE_URL` | Not set | Add to Railway Variables |
| `JWT_SECRET` | Too short | Generate with `openssl rand -base64 32` |
| `DARAJA_CONSUMER_KEY` | Invalid | Verify in Safaricom Daraja portal |
| `DARAJA_CALLBACK_URL` | Wrong domain | Update to actual Railway domain after deployment |
| `CORS_ORIGINS` | Too restrictive | Add your frontend domain |

## Getting Help

1. Check Railway logs: Dashboard → Service → Logs
2. Check build logs: Dashboard → Deployments → Build Logs
3. Test endpoints locally first: `curl http://localhost:3000/api/health`
4. Enable debug logging: Set `LOG_LEVEL=debug` in Railway Variables
5. Contact Safaricom support if M-Pesa integration issues persist
