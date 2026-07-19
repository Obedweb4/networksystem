# Daraja M-Pesa STK Push Integration Guide

This document describes the M-Pesa STK Push payment integration using Safaricom's Daraja API.

## Overview

The integration provides:
- **STK Push Payments**: Prompt customers to enter M-Pesa PIN on their phone
- **Payment Callbacks**: Receive real-time payment status updates
- **Payment Recording**: Automatically log successful payments to the database
- **Transaction Queries**: Check payment status at any time

## Architecture

### Components

1. **Daraja Service** (`lib/daraja.ts`)
   - Handles authentication with Daraja API
   - Manages STK Push requests
   - Processes payment callbacks
   - Queries transaction status

2. **Payments Route** (`routes/payments.ts`)
   - `POST /api/payments/mpesa/stkpush` - Initiate payment
   - `POST /api/payments/mpesa/callback` - Webhook for payment status
   - `GET /api/payments/mpesa/stkpush/:id/status` - Check payment status

3. **Database Schema** (`lib/db/schema/stk-push.ts`)
   - Stores STK Push requests
   - Tracks payment status
   - Records failure reasons

## Setup

### 1. Get Daraja Credentials

Visit [Safaricom Developer Portal](https://developer.safaricom.co.ke/):

1. Create a new account or sign in
2. Go to "My Apps" and create a new app
3. Select "M-Pesa STK Push" as the API type
4. Complete the app registration
5. Copy the following:
   - **Consumer Key**
   - **Consumer Secret**
   - **Lipa na M-Pesa Online Passkey**
   - **Business Short Code** (174379 for sandbox, your actual code for production)

### 2. Set Environment Variables

Create a `.env` file or set these in your deployment platform:

```bash
# Daraja Credentials
DARAJA_CONSUMER_KEY=your_consumer_key_here
DARAJA_CONSUMER_SECRET=your_consumer_secret_here
DARAJA_PASSKEY=your_passkey_here
DARAJA_BUSINESS_CODE=174379  # Sandbox code, use your actual code for production
DARAJA_CALLBACK_URL=https://your-domain.com/api/payments/mpesa/callback

# Other required variables
DATABASE_URL=postgresql://user:password@localhost:5432/pulsenet
JWT_SECRET=your-long-random-secret
NODE_ENV=development  # or production
```

### 3. Build and Run

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run API server (from root directory)
cd artifacts/api-server && pnpm start
```

## API Endpoints

### 1. Initiate STK Push Payment

**Endpoint:** `POST /api/payments/mpesa/stkpush`

**Authentication:** Required (JWT Bearer token)

**Request Body:**
```json
{
  "customerId": "uuid-of-customer",
  "phoneNumber": "+254712345678",
  "amount": "100.00",
  "description": "Service subscription payment",
  "planId": "uuid-of-plan-optional",
  "invoiceId": "uuid-of-invoice-optional"
}
```

**Response (201 Created):**
```json
{
  "message": "STK Push initiated successfully",
  "checkoutRequestId": "ws_CO_123456789",
  "stkRequestId": "request-uuid",
  "customerMessage": "Enter M-PESA PIN to complete payment"
}
```

**Error Response (400):**
```json
{
  "error": "Validation failed",
  "details": [...]
}
```

### 2. Payment Callback Webhook

**Endpoint:** `POST /api/payments/mpesa/callback`

**Authentication:** Not required (called by Safaricom servers)

**Webhook Body (sent by Safaricom):**
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "request-id",
      "CheckoutRequestID": "ws_CO_123456789",
      "ResultCode": 0,
      "ResultDesc": "The service request has been processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {"Name": "Amount", "Value": "100.00"},
          {"Name": "MpesaReceiptNumber", "Value": "ABC123DEF456"},
          {"Name": "TransactionDate", "Value": "20240101120000"},
          {"Name": "PhoneNumber", "Value": "254712345678"}
        ]
      }
    }
  }
}
```

**Result Codes:**
- `0` - Success: Payment completed
- `1032` - Request cancelled by user
- `2001` - Unable to queue the transaction

### 3. Query Payment Status

**Endpoint:** `GET /api/payments/mpesa/stkpush/:checkoutRequestId/status`

**Authentication:** Required (JWT Bearer token)

**Response (200):**
```json
{
  "checkoutRequestId": "ws_CO_123456789",
  "status": "COMPLETED",
  "amount": "100.00",
  "phone": "+254712345678",
  "failureReason": null,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z"
}
```

## Data Flow

### Happy Path (Successful Payment)

```
1. Client calls POST /api/payments/mpesa/stkpush
   ↓
2. API validates request and customer
   ↓
3. Daraja service authenticates with Safaricom
   ↓
4. STK Push prompt sent to customer's phone
   ↓
5. Customer enters M-Pesa PIN
   ↓
6. Safaricom calls POST /api/payments/mpesa/callback (webhook)
   ↓
7. API updates STK request status to COMPLETED
   ↓
8. Payment record created in database
   ↓
9. Invoice marked as PAID (if linked)
```

### Error Path (Payment Cancelled)

```
1. STK Push initiated (same as above)
   ↓
2. Customer presses "Cancel" or enters wrong PIN
   ↓
3. Safaricom calls callback with ResultCode != 0
   ↓
4. API updates STK request status to FAILED
   ↓
5. Failure reason stored in database
```

## Testing

### Local Testing

1. **Test with Mock Credentials** (Sandbox)
   ```bash
   # Use test credentials from Daraja portal
   DARAJA_CONSUMER_KEY=test_key
   DARAJA_CONSUMER_SECRET=test_secret
   DARAJA_PASSKEY=test_passkey
   DARAJA_BUSINESS_CODE=174379
   ```

2. **Run Test Script**
   ```bash
   chmod +x scripts/test-daraja-payment.sh
   bash scripts/test-daraja-payment.sh
   ```

3. **Manual Curl Test**
   ```bash
   # Get JWT token first
   JWT_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"password"}' | jq -r '.tokens.accessToken')
   
   # Initiate payment
   curl -X POST http://localhost:3000/api/payments/mpesa/stkpush \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -d '{
       "customerId": "customer-uuid",
       "phoneNumber": "+254712345678",
       "amount": "100.00",
       "description": "Test payment"
     }'
   ```

### Production Testing

Before going live:

1. **Update Credentials**
   - Use production credentials from Daraja
   - Update DARAJA_BUSINESS_CODE to your actual code
   - Update DARAJA_CALLBACK_URL to production domain

2. **Test Full Flow**
   - Initiate a real payment
   - Complete the payment on your phone
   - Verify callback was received and recorded
   - Check payment appears in database

3. **Monitor Logs**
   - Check API logs for any errors
   - Verify callback receipts
   - Monitor payment processing times

## Troubleshooting

### Issue: "Missing required Daraja environment variables"

**Solution:** Ensure all these variables are set:
- DARAJA_CONSUMER_KEY
- DARAJA_CONSUMER_SECRET
- DARAJA_PASSKEY
- DARAJA_BUSINESS_CODE
- DARAJA_CALLBACK_URL

### Issue: "Failed to get access token"

**Possible Causes:**
- Invalid Consumer Key or Secret
- Daraja API service is down
- Network connectivity issue

**Solution:**
1. Verify credentials in Daraja portal
2. Check network connectivity
3. Check API server logs for detailed error
4. Try using a different network

### Issue: "STK Push request failed"

**Possible Causes:**
- Invalid phone number format
- Invalid amount
- Customer not found
- Tenant not found

**Solution:**
1. Verify phone number is in format: +254XXXXXXXXX (12 digits starting with +254)
2. Verify amount is valid: "100.00" (not "100" or "100,00")
3. Check customer exists in database
4. Check tenant exists in database
5. Review API response for specific error

### Issue: "Callback not being received"

**Possible Causes:**
- DARAJA_CALLBACK_URL is incorrect
- API server not publicly accessible
- Safaricom IP not whitelisted (production only)
- Callback endpoint returning non-200 status

**Solution:**
1. Verify DARAJA_CALLBACK_URL is accessible: `curl https://your-domain.com/api/payments/mpesa/callback`
2. Check API is returning 200 OK for POST requests
3. Review Railway/server logs for POST requests to callback endpoint
4. For production: Contact Safaricom support for IP whitelisting

### Issue: "Payment recorded but invoice not marked as PAID"

**Solution:**
1. Verify invoice amount matches payment amount
2. Check if there are multiple payments for same invoice
3. Review database records to verify payment was created
4. Check if invoice status update logic is working

## Security Considerations

1. **Always Use HTTPS** in production
2. **Validate Callbacks**: Verify signature (future enhancement)
3. **Idempotent Operations**: Handle duplicate callbacks gracefully
4. **Rate Limiting**: Implement rate limiting on callback endpoint
5. **Audit Logging**: All payment transactions are logged
6. **PCI Compliance**: Never store M-Pesa PINs or full card details
7. **Secrets Management**: Use environment variables or secret managers, never commit credentials

## Performance Optimization

1. **Token Caching**: Access tokens are cached and reused (expires in 1 hour)
2. **Connection Pooling**: Database connections are pooled
3. **Async Processing**: All operations are asynchronous
4. **Error Handling**: Graceful degradation on API failures

## Future Enhancements

1. **STK Push Query**: Automatically check status if callback not received
2. **Payment Retry Logic**: Automatic retry on failure
3. **Refund Processing**: B2C API for refunds
4. **Multi-Currency**: Support for different currency conversions
5. **Webhook Signature Validation**: Verify Safaricom callbacks
6. **Rate Limiting**: Prevent abuse of payment endpoints

## Support

For issues or questions:
1. Check this documentation
2. Review Daraja API docs: https://developer.safaricom.co.ke/
3. Check application logs in Railway
4. Contact Safaricom support: https://developer.safaricom.co.ke/support
