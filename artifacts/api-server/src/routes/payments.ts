import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  stkPushRequestsTable,
  invoicesTable,
  paymentsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { createDarajaService, type STKPushCallback } from "../lib/daraja";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Zod schemas for validation
const InitiateStkPushBodySchema = z.object({
  customerId: z.string().uuid(),
  phoneNumber: z
    .string()
    .regex(/^\+?254\d{9}$/, "Phone number must be in format +254XXXXXXXXX"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount format"),
  planId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  description: z.string().min(1).max(100),
});

const STKPushCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.any(),
            })
          ),
        })
        .optional(),
    }),
  }),
});

type InitiateStkPushBody = z.infer<typeof InitiateStkPushBodySchema>;
type STKPushCallbackBody = z.infer<typeof STKPushCallbackSchema>;

/**
 * POST /api/payments/mpesa/stkpush
 * Initiate M-Pesa STK Push request
 */
router.post("/mpesa/stkpush", requireAuth, async (req: Request, res: Response) => {
  try {
    const parse = InitiateStkPushBodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parse.error.issues,
      });
      return;
    }

    const { tenantId } = req.user!;
    const { customerId, phoneNumber, amount, planId, invoiceId, description } = parse.data;

    // Verify customer belongs to this tenant
    const [customer] = await db
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    // If invoiceId provided, verify it belongs to this tenant
    if (invoiceId) {
      const [invoice] = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, invoiceId),
            eq(invoicesTable.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
    }

    // Initialize Daraja service
    const isProduction = process.env.NODE_ENV === "production";
    const darajaService = createDarajaService(
      isProduction ? "production" : "sandbox"
    );

    // Generate unique checkout request ID
    const accountReference = `${tenantId.slice(0, 8)}-${Date.now()}`;

    // Initiate STK Push
    const stkResponse = await darajaService.initiateStkPush(
      phoneNumber,
      amount,
      accountReference,
      description
    );

    // Store STK Push request in database
    // If planId not provided, use invoiceId as a reference, otherwise generate a placeholder
    const effectivePlanId = planId || (invoiceId || customerId); // Use customer ID as fallback
    
    const [stkRequest] = await db
      .insert(stkPushRequestsTable)
      .values({
        tenantId,
        customerId,
        planId: effectivePlanId,
        phone: phoneNumber,
        amount: amount,
        checkoutRequestId: stkResponse.CheckoutRequestID,
        status: "PENDING",
      })
      .returning();

    logger.info({ stkRequestId: stkRequest.id, checkoutRequestId: stkResponse.CheckoutRequestID }, "STK Push request created");

    res.status(201).json({
      message: "STK Push initiated successfully",
      checkoutRequestId: stkResponse.CheckoutRequestID,
      stkRequestId: stkRequest.id,
      customerMessage: stkResponse.CustomerMessage,
    });
  } catch (error) {
    logger.error({ err: error }, "STK Push initiation failed");
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to initiate STK Push",
    });
  }
});

/**
 * POST /api/payments/mpesa/callback
 * Webhook endpoint for M-Pesa STK Push callback
 * Called by Safaricom after customer confirms/rejects payment
 */
router.post("/mpesa/callback", async (req: Request, res: Response) => {
  try {
    // Parse callback body
    const parse = STKPushCallbackSchema.safeParse(req.body);
    if (!parse.success) {
      logger.warn({ err: parse.error }, "Invalid callback body");
      res.status(400).json({ error: "Invalid callback" });
      return;
    }

    const callback = parse.data.Body.stkCallback;
    const { ResultCode, CheckoutRequestID, ResultDesc, CallbackMetadata } =
      callback;

    logger.info({ checkoutRequestId: CheckoutRequestID, resultCode: ResultCode, resultDesc: ResultDesc }, "STK Push callback received");

    // Find STK request by checkout request ID
    const [stkRequest] = await db
      .select()
      .from(stkPushRequestsTable)
      .where(eq(stkPushRequestsTable.checkoutRequestId, CheckoutRequestID))
      .limit(1);

    if (!stkRequest) {
      logger.warn({ CheckoutRequestID }, "STK Request not found for callback");
      res.status(404).json({ error: "STK Request not found" });
      return;
    }

    if (ResultCode === 0) {
      // Payment successful (ResultCode 0 = Success)
      const phoneNumber = CallbackMetadata?.Item?.find(
        (item) => item.Name === "PhoneNumber"
      )?.Value as string | undefined;
      const mpesaCode = CallbackMetadata?.Item?.find(
        (item) => item.Name === "MpesaReceiptNumber"
      )?.Value as string | undefined;
      const amount = CallbackMetadata?.Item?.find(
        (item) => item.Name === "Amount"
      )?.Value as string | undefined;
      const transactionDate = CallbackMetadata?.Item?.find(
        (item) => item.Name === "TransactionDate"
      )?.Value as string | undefined;

      // Update STK request status
      await db
        .update(stkPushRequestsTable)
        .set({
          status: "COMPLETED",
          updatedAt: new Date(),
        })
        .where(eq(stkPushRequestsTable.id, stkRequest.id));

      // Create payment record
      const [invoice] = await db
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, stkRequest.customerId))
        .limit(1);

      const [payment] = await db
        .insert(paymentsTable)
        .values({
          tenantId: stkRequest.tenantId,
          customerId: stkRequest.customerId,
          invoiceId: stkRequest.subscriptionId || null,
          amount: stkRequest.amount,
          method: "MPESA",
          reference: mpesaCode || CheckoutRequestID,
          status: "COMPLETED",
        })
        .returning();

      logger.info({ paymentId: payment.id, amount: stkRequest.amount, reference: mpesaCode }, "Payment recorded successfully");
    } else {
      // Payment failed
      await db
        .update(stkPushRequestsTable)
        .set({
          status: "FAILED",
          failureReason: ResultDesc,
          updatedAt: new Date(),
        })
        .where(eq(stkPushRequestsTable.id, stkRequest.id));

      logger.warn({ stkRequestId: stkRequest.id, reason: ResultDesc }, "Payment failed");
    }

    // Return 200 OK to acknowledge receipt of callback
    res.status(200).json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error }, "Callback processing failed");
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Callback processing failed",
    });
  }
});

/**
 * GET /api/payments/mpesa/stkpush/:checkoutRequestId/status
 * Query status of a specific STK Push request
 */
router.get(
  "/mpesa/stkpush/:checkoutRequestId/status",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const checkoutRequestId = String(req.params.checkoutRequestId);
      const { tenantId } = req.user!;

      // Find STK request
      const [stkRequest] = await db
        .select()
        .from(stkPushRequestsTable)
        .where(
          and(
            eq(stkPushRequestsTable.checkoutRequestId, checkoutRequestId),
            eq(stkPushRequestsTable.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!stkRequest) {
        res.status(404).json({ error: "STK Request not found" });
        return;
      }

      // If still pending, optionally query Daraja API for status
      if (stkRequest.status === "PENDING") {
        try {
          const isProduction = process.env.NODE_ENV === "production";
          const darajaService = createDarajaService(
            isProduction ? "production" : "sandbox"
          );

          const queryResult = await darajaService.queryTransactionStatus(
            checkoutRequestId
          );

          if (queryResult.ResultCode === 0) {
            // Update to completed if not already
            if (stkRequest.status === "PENDING") {
              await db
                .update(stkPushRequestsTable)
                .set({
                  status: "COMPLETED",
                  updatedAt: new Date(),
                })
                .where(eq(stkPushRequestsTable.id, stkRequest.id));
            }
          } else if (queryResult.ResultCode !== 0) {
            // Update failure status
            await db
              .update(stkPushRequestsTable)
              .set({
                status: "FAILED",
                failureReason: queryResult.ResultDesc,
                updatedAt: new Date(),
              })
              .where(eq(stkPushRequestsTable.id, stkRequest.id));
          }
        } catch (queryError) {
          logger.warn({ err: queryError }, "Failed to query transaction status");
          // Continue anyway, return current DB status
        }
      }

      res.json({
        checkoutRequestId,
        status: stkRequest.status,
        amount: stkRequest.amount,
        phone: stkRequest.phone,
        failureReason: stkRequest.failureReason,
        createdAt: stkRequest.createdAt,
        updatedAt: stkRequest.updatedAt,
      });
  } catch (error) {
    logger.error({ err: error }, "Status query failed");
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to query status",
    });
  }
  }
);

export default router;
