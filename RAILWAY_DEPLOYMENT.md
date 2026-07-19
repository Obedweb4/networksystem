# Railway Deployment Guide for Daraja M-Pesa Integration

This guide walks you through deploying this application to Railway with M-Pesa payment integration.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Account**: Repository should be pushed to GitHub
3. **Daraja Credentials**: From [Safaricom Developer Portal](https://developer.safaricom.co.ke/)
   - Consumer Key
   - Consumer Secret
   - Passkey (Lipa na M-Pesa Online Passkey)
   - Business Short Code (e.g., 174379 for sandbox, your actual code for production)
4. **PostgreSQL Database**: Railway provides this automatically

## Step 1: Prepare Your Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "feat: Add Daraja M-Pesa STK Push integration"
git push origin main
```

## Step 2: Create a Railway Project

1. Visit [railway.app](https://railway.app) and sign in
2. Click "Create New Project"
3. Select "Deploy from GitHub"
4. Authorize Railway to access your GitHub account
5. Select the `networksystem` repository
6. Select the `main` branch (or your deployment branch)

## Step 3: Add PostgreSQL Database

1. In the Railway dashboard, click "Add Service"
2. Select "PostgreSQL"
3. Railway will automatically create a PostgreSQL instance
4. Copy the `DATABASE_URL` from the PostgreSQL service environment variables

## Step 4: Configure Environment Variables

In the Railway project dashboard, add these environment variables:

### Required Environment Variables

```
# Database (copied from PostgreSQL service)
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/railway

# Application Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# CORS Configuration (update with your actual domains)
CORS_ORIGINS=https://portal.example.co.ke,https://admin.example.co.ke

# JWT Secret (generate a long random string)
JWT_SECRET=your-long-random-secret-key-here

# Daraja M-Pesa Configuration
DARAJA_CONSUMER_KEY=your-consumer-key-here
DARAJA_CONSUMER_SECRET=your-consumer-secret-here
DARAJA_PASSKEY=your-passkey-here
DARAJA_BUSINESS_CODE=174379
DARAJA_CALLBACK_URL=https://your-railway-app-domain.com/api/payments/mpesa/callback

# Initial Seed Data (optional)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=secure-password
SEED_CUSTOMER_PHONE=254743901680
```

### Getting Daraja Credentials

1. Visit [https://developer.safaricom.co.ke/](https://developer.safaricom.co.ke/)
2. Create an app for "M-Pesa STK Push"
3. Copy the Consumer Key and Consumer Secret
4. Go to "Test Credentials" section and copy the Passkey
5. Use Business Short Code: `174379` (sandbox) or your actual code (production)

### Generating JWT Secret

Run this command locally to generate a secure JWT secret:

```bash
# macOS/Linux
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))
```

## Step 5: Deploy

1. In Railway dashboard, the API server service should be automatically created
2. Click on the service and select the source
3. Set the following in service settings:
   - **Build**: Automatic (Railway will detect the Dockerfile)
   - **Start Command**: Leave empty if using Dockerfile
4. Railway will automatically build and deploy your application

### Deployment Progress

- Check the "Deployments" tab to see real-time build and deployment logs
- Wait for the deployment to complete (usually 5-10 minutes for first deploy)

## Step 6: Configure Domain

1. In Railway dashboard, go to the API server service settings
2. Click "Generate Domain" to get a public URL
3. The domain will be something like: `https://networksystem-prod-api.railway.app`
4. Use this domain as your `DARAJA_CALLBACK_URL` in environment variables:
   ```
   DARAJA_CALLBACK_URL=https://networksystem-prod-api.railway.app/api/payments/mpesa/callback
   ```

## Step 7: Verify Deployment

1. Check the health endpoint:
   ```bash
   curl https://your-railway-domain.com/api/health
   ```

2. Check logs in Railway dashboard for any errors

3. Test the M-Pesa integration:
   ```bash
   curl -X POST https://your-railway-domain.com/api/payments/mpesa/stkpush \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "customerId": "customer-uuid",
       "phoneNumber": "+254712345678",
       "amount": "100.00",
       "description": "Test payment"
     }'
   ```

## Step 8: Frontend Configuration

Update your frontend (customer-portal and admin) to point to the new Railway API domain:

1. In `artifacts/customer-portal/.env.production`:
   ```
   REACT_APP_API_URL=https://your-railway-domain.com/api
   ```

2. In `artifacts/admin/.env.production`:
   ```
   REACT_APP_API_URL=https://your-railway-domain.com/api
   ```

3. Redeploy frontends or update environment variables in their deployment platforms

## Troubleshooting

### Build Fails
- Check Railway build logs for TypeScript or dependency errors
- Ensure `pnpm-lock.yaml` is committed to the repository
- Verify all workspace dependencies are correctly declared in `package.json` files

### Runtime Errors
- Check application logs in Railway dashboard under "Logs"
- Look for missing environment variables:
  ```
  Error: Missing required Daraja environment variables
  ```
- Verify DATABASE_URL is accessible and database is running

### Daraja Connection Fails
- Verify credentials are correct in Safaricom Developer Portal
- Check DARAJA_CALLBACK_URL matches your Railway domain
- For sandbox testing, ensure you're using sandbox credentials

### Payment Callbacks Not Working
- Verify Railway domain is publicly accessible: `curl https://your-domain.com/api/health`
- Check that DARAJA_CALLBACK_URL is correctly set
- Monitor Railway logs for callback POST requests to `/api/payments/mpesa/callback`
- Safaricom may require IP whitelisting (contact support if needed)

## Monitoring and Maintenance

### View Logs
```bash
# In Railway dashboard, click the API service → Logs tab
# Filter by specific services or search for errors
```

### Check Metrics
Railway provides metrics for:
- CPU Usage
- Memory Usage
- Disk Usage
- Response Times
- Request Rates

### Database Migrations
If you need to update the database schema:
1. Update the migration files in `lib/db/src/migrations/`
2. Commit and push changes
3. Railway will run migrations during deployment (ensure your build script handles this)

## Production Checklist

Before going live with real M-Pesa:

- [ ] Update `DARAJA_BUSINESS_CODE` to your production code
- [ ] Update Daraja credentials to production credentials
- [ ] Update `DARAJA_CALLBACK_URL` to production domain
- [ ] Update `CORS_ORIGINS` to your actual frontend domains
- [ ] Generate a new strong `JWT_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Set `LOG_LEVEL=warn` (reduce logs in production)
- [ ] Enable HTTPS (Railway does this automatically)
- [ ] Test payment flow end-to-end
- [ ] Monitor for errors in first 24 hours

## Support and Resources

- **Railway Docs**: https://docs.railway.app/
- **Daraja API Docs**: https://developer.safaricom.co.ke/
- **M-Pesa STK Push Guide**: https://developer.safaricom.co.ke/docs#lipa-na-m-pesa-online-stk-push

## Rolling Back

If you need to rollback to a previous deployment:

1. In Railway dashboard, go to "Deployments"
2. Find the previous working deployment
3. Click the three dots menu
4. Select "Rollback to this deployment"

This will redeploy the previous version immediately.
