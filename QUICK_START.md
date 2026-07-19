# Quick Start: Daraja M-Pesa Integration & Railway Deployment

This guide will get you from code to running production M-Pesa payments in minutes.

## What You'll Get

- ✅ M-Pesa STK Push payment integration
- ✅ Real-time payment callbacks
- ✅ Production-ready Railway deployment
- ✅ No payment data loss or errors
- ✅ Easy local testing

## Prerequisites

- Node.js 18+ and pnpm
- GitHub account (for Railway deployment)
- Daraja credentials from Safaricom
- Railway account (free tier available)

## 1. Get Your Daraja Credentials (5 minutes)

1. Go to https://developer.safaricom.co.ke/
2. Sign up or log in
3. Create a new app, select "M-Pesa STK Push"
4. Copy these values:
   - **DARAJA_CONSUMER_KEY** (under Credentials)
   - **DARAJA_CONSUMER_SECRET** (under Credentials)
   - **DARAJA_PASSKEY** (under Test Credentials)
   - **DARAJA_BUSINESS_CODE**: `174379` (sandbox)

## 2. Clone and Set Up Locally (2 minutes)

```bash
# Clone the repository
git clone https://github.com/Obedweb4/networksystem.git
cd networksystem

# Install dependencies
pnpm install

# Create .env file for local development
cat > .env.local << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/pulsenet
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002

# Daraja Credentials
DARAJA_CONSUMER_KEY=your_consumer_key_here
DARAJA_CONSUMER_SECRET=your_consumer_secret_here
DARAJA_PASSKEY=your_passkey_here
DARAJA_BUSINESS_CODE=174379
DARAJA_CALLBACK_URL=http://localhost:3000/api/payments/mpesa/callback
EOF
```

## 3. Test Locally (3 minutes)

```bash
# Build the project
pnpm run build

# Start the API server (in one terminal)
cd artifacts/api-server && pnpm start

# In another terminal, test the health endpoint
curl http://localhost:3000/api/health

# Test the callback endpoint (should return 200 OK)
bash ../../scripts/test-daraja-payment.sh
```

## 4. Deploy to Railway (10 minutes)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "feat: Add Daraja M-Pesa integration"
git push origin main
```

### Step 2: Create Railway Project

1. Go to https://railway.app
2. Click "Create New Project"
3. Select "Deploy from GitHub"
4. Connect your GitHub account
5. Select `networksystem` repository
6. Select `main` branch

### Step 3: Add PostgreSQL

1. In Railway dashboard, click "Add Service"
2. Select "PostgreSQL"
3. Railway will create the database automatically

### Step 4: Configure Environment Variables

In Railway dashboard, add these variables:

```
# Copy DATABASE_URL from PostgreSQL service
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/railway

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your-long-random-secret
CORS_ORIGINS=https://your-domain.com

# Daraja (YOUR ACTUAL CREDENTIALS)
DARAJA_CONSUMER_KEY=your_consumer_key
DARAJA_CONSUMER_SECRET=your_consumer_secret
DARAJA_PASSKEY=your_passkey
DARAJA_BUSINESS_CODE=174379
DARAJA_CALLBACK_URL=https://your-railway-domain.com/api/payments/mpesa/callback
```

### Step 5: Deploy

Railway automatically deploys when you push to GitHub. Check the "Deployments" tab to see progress.

### Step 6: Get Your Domain

1. Click the API service
2. Go to "Settings" tab
3. Copy your Railway domain: `https://your-app-name.up.railway.app`
4. Update `DARAJA_CALLBACK_URL` environment variable with this domain

### Step 7: Verify Deployment

```bash
# Check health endpoint
curl https://your-railway-domain.com/api/health

# You should see: {"status":"ok"}
```

## 5. Test Production Payment (optional)

```bash
# Get authentication token from your admin account
JWT_TOKEN="your-jwt-token-here"
CUSTOMER_ID="customer-uuid-here"

# Initiate a payment
curl -X POST https://your-railway-domain.com/api/payments/mpesa/stkpush \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "customerId": "'$CUSTOMER_ID'",
    "phoneNumber": "+254712345678",
    "amount": "100.00",
    "description": "Test payment"
  }'

# You should see STK Push prompt on the phone number
```

## Common Issues & Fixes

### "Missing Daraja environment variables"
```
Solution: Verify ALL 5 env vars are set:
- DARAJA_CONSUMER_KEY
- DARAJA_CONSUMER_SECRET
- DARAJA_PASSKEY
- DARAJA_BUSINESS_CODE
- DARAJA_CALLBACK_URL
```

### "Failed to get access token"
```
Solution: Check your credentials are correct in Daraja portal
- Generate new credentials if unsure
- Verify Consumer Key and Secret match exactly
```

### "Callback not received"
```
Solution: Verify callback URL:
1. Test manually: curl https://your-domain.com/api/payments/mpesa/callback
2. Should return 200 OK for POST requests
3. Check Railway logs for incoming POST requests
```

### "Build fails on Railway"
```
Solution: 
1. Check Railway logs for specific error
2. Ensure pnpm-lock.yaml is committed
3. Try restarting the deployment
4. Check that all TypeScript compiles: pnpm run typecheck
```

## File Structure

```
networksystem/
├── DARAJA_INTEGRATION.md          # Full integration documentation
├── RAILWAY_DEPLOYMENT.md          # Detailed Railway guide
├── QUICK_START.md                 # This file
├── railway.json                   # Railway config
├── Dockerfile                     # Container config
├── .env.example                   # Environment template
├── scripts/
│   └── test-daraja-payment.sh    # Test script
├── artifacts/
│   └── api-server/src/
│       ├── lib/daraja.ts         # Daraja service
│       └── routes/payments.ts    # Payment endpoints
└── lib/db/src/schema/
    └── stk-push.ts               # Database schema
```

## Next Steps

1. **Customize for Your Use Case**
   - Update CORS origins for your actual domains
   - Configure webhook signatures if needed
   - Add additional payment validation

2. **Monitor Production**
   - Check Railway logs regularly
   - Monitor payment success rates
   - Set up alerts for failures

3. **Scale Up**
   - Add more payment methods (B2C, C2B, etc.)
   - Implement refunds
   - Add payment analytics

## Resources

- **Daraja Documentation**: https://developer.safaricom.co.ke/docs
- **Railway Documentation**: https://docs.railway.app/
- **M-Pesa STK Push**: https://developer.safaricom.co.ke/docs#lipa-na-m-pesa-online-stk-push
- **API Schema**: See `DARAJA_INTEGRATION.md` for endpoints

## Support

For issues:

1. **Local Testing Failed?**
   - Check `.env.local` has all required variables
   - Run `pnpm run typecheck` to find compile errors
   - Review `DARAJA_INTEGRATION.md` troubleshooting section

2. **Deployment Failed?**
   - Check Railway logs in dashboard
   - Verify environment variables are set
   - See `RAILWAY_DEPLOYMENT.md` for detailed troubleshooting

3. **Payment Not Working?**
   - Verify credentials in Daraja portal
   - Check callback URL is public and accessible
   - Review Railway logs for POST requests to callback endpoint

## Summary

You now have:
- ✅ Complete M-Pesa integration
- ✅ Local testing capability
- ✅ Production deployment ready
- ✅ Detailed documentation
- ✅ Working test scripts

Congratulations! Your system is ready for real M-Pesa payments.
