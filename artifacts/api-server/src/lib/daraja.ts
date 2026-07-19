import { logger } from "./logger";

interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  businessCode: string;
  callbackUrl: string;
  environment: "sandbox" | "production";
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

interface STKPushRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: string;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

interface CallbackMetadata {
  Name: string;
  Value: string;
}

export interface STKPushCallback {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: number;
  ResultDesc: string;
  CallbackMetadata?: {
    Item: CallbackMetadata[];
  };
}

class DarajaService {
  private config: DarajaConfig;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: DarajaConfig) {
    this.config = config;
    this.baseUrl =
      config.environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";
  }

  /**
   * Get OAuth2 access token from Daraja API
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiry > now) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${this.config.consumerKey}:${this.config.consumerSecret}`
      ).toString("base64");

      const response = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = (await response.json()) as AccessTokenResponse;
      this.accessToken = data.access_token;
      this.tokenExpiry = now + data.expires_in * 1000 - 60000; // Refresh 1 minute before expiry

      logger.info("Daraja access token obtained successfully");
      return this.accessToken;
    } catch (error) {
      logger.error({ err: error }, "Failed to get Daraja access token");
      throw error;
    }
  }

  /**
   * Initiate STK Push request to customer phone
   */
  async initiateStkPush(
    phoneNumber: string,
    amount: string,
    accountReference: string,
    transactionDesc: string
  ): Promise<STKPushResponse> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[:-]/g, "").slice(0, 14);

      // Generate password: Base64(BusinessCode+Passkey+Timestamp)
      const password = Buffer.from(
        `${this.config.businessCode}${this.config.passkey}${timestamp}`
      ).toString("base64");

      const payload: STKPushRequest = {
        BusinessShortCode: this.config.businessCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phoneNumber,
        PartyB: this.config.businessCode,
        PhoneNumber: phoneNumber,
        CallBackURL: this.config.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc,
      };

      const response = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`STK Push failed: ${error}`);
        throw new Error(`STK Push failed: ${response.statusText}`);
      }

      const data = (await response.json()) as STKPushResponse;

      logger.info({ checkoutRequestId: data.CheckoutRequestID, phone: phoneNumber, amount }, "STK Push initiated successfully");

      return data;
    } catch (error) {
      logger.error({ err: error }, "STK Push error");
      throw error;
    }
  }

  /**
   * Query transaction status using CheckoutRequestID
   */
  async queryTransactionStatus(checkoutRequestId: string): Promise<STKPushCallback> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toISOString().replace(/[:-]/g, "").slice(0, 14);

      const password = Buffer.from(
        `${this.config.businessCode}${this.config.passkey}${timestamp}`
      ).toString("base64");

      const payload = {
        BusinessShortCode: this.config.businessCode,
        CheckoutRequestID: checkoutRequestId,
        Password: password,
        Timestamp: timestamp,
      };

      const response = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Query failed: ${response.statusText}`);
      }

      const data = (await response.json()) as STKPushCallback;
      return data;
    } catch (error) {
      logger.error({ err: error }, "Query transaction status error");
      throw error;
    }
  }

  /**
   * Validate callback signature (optional but recommended for production)
   */
  validateCallbackSignature(signature: string, body: string): boolean {
    // This is a placeholder. In production, you'd validate using Daraja's public key
    // For now, we'll just log the validation attempt
    logger.info("Callback signature validation called");
    return true;
  }
}

export function createDarajaService(environment: "sandbox" | "production" = "production"): DarajaService {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const passkey = process.env.DARAJA_PASSKEY;
  const businessCode = process.env.DARAJA_BUSINESS_CODE;
  const callbackUrl = process.env.DARAJA_CALLBACK_URL;

  if (!consumerKey || !consumerSecret || !passkey || !businessCode || !callbackUrl) {
    throw new Error(
      "Missing required Daraja environment variables: DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_PASSKEY, DARAJA_BUSINESS_CODE, DARAJA_CALLBACK_URL"
    );
  }

  return new DarajaService({
    consumerKey,
    consumerSecret,
    passkey,
    businessCode,
    callbackUrl,
    environment,
  });
}

export default DarajaService;
