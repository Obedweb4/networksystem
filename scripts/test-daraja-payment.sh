#!/bin/bash

# Test Daraja M-Pesa STK Push Integration
# This script tests the M-Pesa payment endpoints

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3000/api}"
JWT_TOKEN="${JWT_TOKEN:-}"
TENANT_ID="${TENANT_ID:-}"
CUSTOMER_ID="${CUSTOMER_ID:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_error() {
    echo -e "${RED}❌ Error: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed"
        exit 1
    fi
    
    print_success "Prerequisites satisfied"
}

# Test health endpoint
test_health() {
    print_info "Testing health endpoint..."
    
    RESPONSE=$(curl -s "${API_URL}/health" | jq -r '.status // "error"')
    
    if [ "$RESPONSE" = "ok" ]; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
        exit 1
    fi
}

# Generate mock JWT token if not provided
generate_mock_token() {
    print_info "Generating mock JWT token..."
    
    if [ -z "$JWT_TOKEN" ]; then
        # Create a simple test payload
        PAYLOAD=$(echo -n '{"sub":"test-user","tenantId":"test-tenant","email":"test@example.com"}' | base64)
        # Note: This is NOT a valid JWT for production, just for local testing
        JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${PAYLOAD}.test-signature"
        print_success "Generated test token"
    fi
}

# Test STK Push endpoint
test_stk_push() {
    print_info "Testing STK Push endpoint..."
    
    if [ -z "$CUSTOMER_ID" ]; then
        print_error "CUSTOMER_ID environment variable not set"
        return 1
    fi
    
    RESPONSE=$(curl -s -X POST "${API_URL}/payments/mpesa/stkpush" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${JWT_TOKEN}" \
        -d "{
            \"customerId\": \"${CUSTOMER_ID}\",
            \"phoneNumber\": \"+254712345678\",
            \"amount\": \"100.00\",
            \"description\": \"Test payment\"
        }")
    
    echo "Response:"
    echo "$RESPONSE" | jq '.'
    
    # Check if response contains error
    if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        print_error "STK Push failed: $(echo "$RESPONSE" | jq -r '.error')"
        return 1
    else
        CHECKOUT_ID=$(echo "$RESPONSE" | jq -r '.checkoutRequestId // empty')
        if [ -z "$CHECKOUT_ID" ]; then
            print_error "No checkoutRequestId in response"
            return 1
        fi
        print_success "STK Push initiated successfully"
        print_info "Checkout Request ID: $CHECKOUT_ID"
        return 0
    fi
}

# Test callback endpoint
test_callback() {
    print_info "Testing callback endpoint (no auth required)..."
    
    RESPONSE=$(curl -s -X POST "${API_URL}/payments/mpesa/callback" \
        -H "Content-Type: application/json" \
        -d "{
            \"Body\": {
                \"stkCallback\": {
                    \"MerchantRequestID\": \"test-request-id\",
                    \"CheckoutRequestID\": \"ws_CO_12345678901234567890\",
                    \"ResultCode\": 0,
                    \"ResultDesc\": \"The service request has been processed successfully.\",
                    \"CallbackMetadata\": {
                        \"Item\": [
                            {\"Name\": \"Amount\", \"Value\": \"100.00\"},
                            {\"Name\": \"MpesaReceiptNumber\", \"Value\": \"ABC123DEF456\"},
                            {\"Name\": \"TransactionDate\", \"Value\": \"20240101120000\"},
                            {\"Name\": \"PhoneNumber\", \"Value\": \"254712345678\"}
                        ]
                    }
                }
            }
        }")
    
    echo "Response:"
    echo "$RESPONSE" | jq '.'
    
    if [ "$(echo "$RESPONSE" | jq -r '.status // empty')" = "ok" ]; then
        print_success "Callback received successfully"
        return 0
    else
        print_error "Callback processing failed"
        return 1
    fi
}

# Main execution
main() {
    print_info "Starting M-Pesa STK Push Integration Tests"
    print_info "API URL: $API_URL"
    
    check_prerequisites
    echo ""
    
    test_health
    echo ""
    
    generate_mock_token
    echo ""
    
    if [ -n "$CUSTOMER_ID" ]; then
        test_stk_push
        echo ""
    else
        print_info "Skipping STK Push test (CUSTOMER_ID not set)"
        print_info "To test STK Push, run with:"
        print_info "  CUSTOMER_ID=your-customer-uuid $0"
        echo ""
    fi
    
    test_callback
    echo ""
    
    print_success "All tests completed!"
}

# Run main function
main
