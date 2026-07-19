# Deployment Checklist: Daraja M-Pesa Integration

Use this checklist to ensure a smooth deployment to Railway with M-Pesa payment functionality.

## Pre-Deployment (Local Testing)

### Code Verification
- [ ] Pull latest code from GitHub
- [ ] Run `pnpm install` successfully
- [ ] Run `pnpm run typecheck` - Daraja and payments files compile without errors
- [ ] Run `pnpm run build` - Build completes successfully
- [ ] No unexpected errors in other files (note any existing issues)

### Environment Setup
- [ ] Copy `.env.example` to `.env.local`
- [ ] Add Daraja credentials to `.env.local`:
  - [ ] DARAJA_CONSUMER_KEY
  - [ ] DARAJA_CONSUMER_SECRET
  - [ ] DARAJA_PASSKEY
  - [ ] DARAJA_BUSINESS_CODE (174379 for sandbox)
- [ ] Set DARAJA_CALLBACK_URL=http://localhost:3000/api/payments/mpesa/callback
- [ ] Configure DATABASE_URL for local PostgreSQL
- [ ] Generate JWT_SECRET: `openssl rand -base64 32`

### Local Testing
- [ ] Start API server: `cd artifacts/api-server && pnpm start`
- [ ] Health check passes: `curl http://localhost:3000/api/health`
- [ ] Test script runs: `bash scripts/test-daraja-payment.sh`
- [ ] No errors in API logs

### Code Commit
- [ ] All files committed: `git status` is clean
- [ ] Commit message describes Daraja integration: `git commit -m "feat: Add Daraja M-Pesa STK Push integration"`
- [ ] Push to main branch: `git push origin main`

## Railway Setup

### Create Railway Project
- [ ] Go to https://railway.app and create new project
- [ ] Connect GitHub account
- [ ] Select `networksystem` repository
- [ ] Select `main` branch
- [ ] Railway automatically detects and creates deployment

### Add PostgreSQL Service
- [ ] In Railway dashboard, click "Add Service"
- [ ] Select "PostgreSQL"
- [ ] Database created and running
- [ ] Copy DATABASE_URL from PostgreSQL service environment

### Configure Environment Variables
In Railway dashboard, set these variables:

**Database**
- [ ] DATABASE_URL (from PostgreSQL service)

**Application**
- [ ] NODE_ENV=production
- [ ] PORT=3000
- [ ] JWT_SECRET=(generate: `openssl rand -base64 32`)
- [ ] LOG_LEVEL=info (or warn for less logging)

**CORS**
- [ ] CORS_ORIGINS=(your actual frontend domains)
  - Example: `https://portal.yourdomain.com,https://admin.yourdomain.com`

**Daraja M-Pesa**
- [ ] DARAJA_CONSUMER_KEY=(from Daraja portal)
- [ ] DARAJA_CONSUMER_SECRET=(from Daraja portal)
- [ ] DARAJA_PASSKEY=(from Daraja portal)
- [ ] DARAJA_BUSINESS_CODE=174379 (sandbox) or your production code
- [ ] DARAJA_CALLBACK_URL=(will update after deployment)

**Optional: Seed Data**
- [ ] SEED_ADMIN_EMAIL=(admin email)
- [ ] SEED_ADMIN_PASSWORD=(strong password)
- [ ] SEED_CUSTOMER_PHONE=(test customer phone)

## Deployment

### Deploy to Railway
- [ ] Railway dashboard shows "Deploying..."
- [ ] Wait for build to complete (5-15 minutes)
- [ ] Check Deployments tab for success
- [ ] No red error indicators

### Post-Deployment Verification
- [ ] Get Railway domain from API service settings (Generate Domain)
  - Example: `https://networksystem-api-prod.railway.app`
- [ ] Update DARAJA_CALLBACK_URL environment variable with Railway domain
  - New value: `https://your-railway-domain.com/api/payments/mpesa/callback`
- [ ] API redeploys automatically (check Deployments tab)

### Health Check
- [ ] Health endpoint responds: `curl https://your-railway-domain.com/api/health`
- [ ] Should return: `{"status":"ok"}`
- [ ] No SSL errors (HTTPS working)

### Logs Check
- [ ] View Railway logs for any errors
- [ ] Look for "Daraja access token obtained successfully" messages
- [ ] No "Missing required Daraja environment variables" errors

## Post-Deployment

### Testing Payment Flow
- [ ] Authenticate and get JWT token
- [ ] Call STK Push endpoint with test customer
- [ ] Receive CheckoutRequestID in response
- [ ] Query payment status with check endpoint
- [ ] (Optional) Test callback with manual POST request

### Frontend Updates
If deploying frontend apps:
- [ ] Update API URL in `artifacts/customer-portal/.env.production`
  - `REACT_APP_API_URL=https://your-railway-domain.com/api`
- [ ] Update API URL in `artifacts/admin/.env.production`
  - `REACT_APP_API_URL=https://your-railway-domain.com/api`
- [ ] Redeploy frontends or update in their deployment platforms

### Daraja Portal Verification
- [ ] Log in to https://developer.safaricom.co.ke/
- [ ] Verify callback configuration matches Railway domain
- [ ] Ensure IP whitelist is configured (if required)
- [ ] Test payment in sandbox mode

## Production Checklist

Before enabling real M-Pesa payments:

### Credentials
- [ ] Update DARAJA_CONSUMER_KEY to production credentials
- [ ] Update DARAJA_CONSUMER_SECRET to production credentials
- [ ] Update DARAJA_PASSKEY to production passkey
- [ ] Update DARAJA_BUSINESS_CODE to your actual business code
- [ ] Verify all credentials in Daraja portal

### Security
- [ ] Regenerate JWT_SECRET: `openssl rand -base64 32`
- [ ] Update CORS_ORIGINS to actual production domains only
- [ ] Remove any test/sandbox domains from CORS
- [ ] Verify HTTPS is enabled (should be automatic on Railway)
- [ ] Check LOG_LEVEL is set to warn or error (not debug)

### Payment Configuration
- [ ] Test full payment flow end-to-end
- [ ] Verify payments are recorded in database
- [ ] Check M-Pesa callbacks are being received
- [ ] Test invoice marking as PAID after payment
- [ ] Verify payment reports show correct amounts

### Monitoring
- [ ] Set up log monitoring in Railway
- [ ] Monitor error rates for first 24 hours
- [ ] Watch for payment processing delays
- [ ] Monitor database disk usage
- [ ] Set up alerts for failures (if available)

### Documentation
- [ ] Update frontend documentation with new API endpoint
- [ ] Document Daraja credentials storage location
- [ ] Document callback URL for reference
- [ ] Document rollback procedure

## Rollback Plan

If issues arise after deployment:

### Quick Rollback
- [ ] In Railway Deployments tab, find previous working deployment
- [ ] Click three dots → "Rollback to this deployment"
- [ ] System redeploys previous version immediately
- [ ] Verify health endpoint returns ok

### Debugging
- [ ] Check Railway logs for specific error messages
- [ ] Verify environment variables are still set
- [ ] Check if database is still accessible
- [ ] Review Daraja API status
- [ ] Test locally to isolate issue

## Common Issues & Resolutions

### Build Fails
- **Issue**: TypeScript compilation fails in Railway
- **Check**: Ensure `pnpm-lock.yaml` is committed
- **Fix**: Restart deployment or rebuild from CLI

### Payment Endpoints Return 404
- **Issue**: `/api/payments/mpesa/stkpush` not found
- **Check**: Verify payments router is registered in routes/index.ts
- **Fix**: Redeploy or check git status

### Daraja Credentials Error
- **Issue**: "Missing required Daraja environment variables"
- **Check**: All 5 Daraja variables are set in Railway
- **Fix**: Add missing variables and redeploy

### Callback Not Received
- **Issue**: No payments being recorded after payment completes
- **Check**: DARAJA_CALLBACK_URL is set to Railway domain
- **Fix**: Update URL and wait for callback retry

### Database Connection Error
- **Issue**: "Unable to connect to database"
- **Check**: DATABASE_URL is copied from PostgreSQL service
- **Fix**: Verify PostgreSQL service is running, copy fresh URL

## Support Resources

- **Railway Docs**: https://docs.railway.app/
- **Daraja API Docs**: https://developer.safaricom.co.ke/docs
- **Project Docs**: See QUICK_START.md, RAILWAY_DEPLOYMENT.md, DARAJA_INTEGRATION.md
- **This Project**: Check GitHub issues or IMPLEMENTATION_SUMMARY.md

## Sign-Off

- [ ] Developer: Deployment completed and tested
- [ ] QA: Payment flow verified in production
- [ ] DevOps: Monitoring configured and alerts set
- [ ] Project Lead: Live M-Pesa integration approved

---

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Version**: _______________  
**Notes**: _______________________________________________________________
