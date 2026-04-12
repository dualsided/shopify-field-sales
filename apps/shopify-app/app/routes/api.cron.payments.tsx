import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { prisma } from "@field-sales/database";

// Secret key to protect internal endpoints
const APP_SECRET = process.env.APP_SECRET;

/**
 * Cron endpoint for processing order payments
 *
 * This endpoint should run daily to:
 * 1. Find orders with payment terms that are now due
 * 2. Charge vaulted payment methods
 * 3. Send invoices for orders without vaulted payment methods
 *
 * Trigger with: POST /api/cron/payments
 * Headers: x-app-secret: <APP_SECRET>
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify app secret
  const secret = request.headers.get("x-app-secret");
  if (APP_SECRET && secret !== APP_SECRET) {
    console.log("[Payments Cron] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  console.log(`[Payments Cron] Running at ${now.toISOString()}`);

  // Find orders that need payment processing:
  // - Status is PENDING (order placed but not paid)
  // - Has passed payment due date OR payment terms is DUE_ON_ORDER
  // - Not already paid
  const dueOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paidAt: null,
      OR: [
        // Orders with terms that are now due
        {
          paymentDueDate: { lte: now },
        },
        // Orders due on order with no payment method (need invoice)
        {
          paymentTerms: "DUE_ON_ORDER",
          paymentMethodId: null,
          shopifyInvoiceId: null,
        },
      ],
    },
    include: {
      shop: {
        select: {
          id: true,
          shopifyDomain: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          shopifyCompanyId: true,
        },
      },
      contact: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          shopifyCustomerId: true,
        },
      },
    },
  });

  console.log(`[Payments Cron] Found ${dueOrders.length} orders to process`);

  const results: Array<{
    orderId: string;
    orderNumber: string;
    shop: string;
    action: "charged" | "invoice_sent" | "skipped";
    success: boolean;
    error?: string;
  }> = [];

  // Group orders by shop for efficient admin client reuse
  const ordersByShop = dueOrders.reduce((acc, order) => {
    const domain = order.shop.shopifyDomain;
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(order);
    return acc;
  }, {} as Record<string, typeof dueOrders>);

  for (const [shopDomain, orders] of Object.entries(ordersByShop)) {
    try {
      // Get admin client for this shop
      const { admin } = await unauthenticated.admin(shopDomain);

      for (const order of orders) {
        try {
          // Check if order has a vaulted payment method
          if (order.paymentMethodId) {
            // Charge the vaulted payment method
            const chargeResult = await chargeVaultedCard(
              admin,
              order.shopifyOrderId!,
              order.paymentMethodId,
              order.totalCents
            );

            if (chargeResult.success) {
              // Update order as paid
              await prisma.order.update({
                where: { id: order.id },
                data: {
                  status: "PAID",
                  paidAt: new Date(),
                },
              });

              results.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                shop: shopDomain,
                action: "charged",
                success: true,
              });
            } else {
              // Card charge failed - send invoice as fallback
              const invoiceResult = await sendPaymentInvoice(
                admin,
                order.shopifyDraftOrderId!,
                order.contact?.email
              );

              await prisma.order.update({
                where: { id: order.id },
                data: {
                  shopifyInvoiceId: invoiceResult.invoiceId,
                },
              });

              results.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                shop: shopDomain,
                action: "invoice_sent",
                success: true,
                error: `Card charge failed: ${chargeResult.error}. Invoice sent as fallback.`,
              });
            }
          } else {
            // No vaulted card - send invoice
            if (!order.contact?.email) {
              results.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                shop: shopDomain,
                action: "skipped",
                success: false,
                error: "No contact email for invoice",
              });
              continue;
            }

            const invoiceResult = await sendPaymentInvoice(
              admin,
              order.shopifyDraftOrderId!,
              order.contact.email
            );

            if (invoiceResult.success) {
              await prisma.order.update({
                where: { id: order.id },
                data: {
                  shopifyInvoiceId: invoiceResult.invoiceId,
                },
              });

              results.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                shop: shopDomain,
                action: "invoice_sent",
                success: true,
              });
            } else {
              results.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                shop: shopDomain,
                action: "invoice_sent",
                success: false,
                error: invoiceResult.error,
              });
            }
          }
        } catch (error) {
          console.error(`[Payments Cron] Error processing order ${order.orderNumber}:`, error);
          results.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            shop: shopDomain,
            action: "skipped",
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    } catch (error) {
      console.error(`[Payments Cron] Error getting admin for ${shopDomain}:`, error);
      for (const order of orders) {
        results.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          shop: shopDomain,
          action: "skipped",
          success: false,
          error: `Failed to authenticate shop: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const chargedCount = results.filter((r) => r.action === "charged" && r.success).length;
  const invoicedCount = results.filter((r) => r.action === "invoice_sent" && r.success).length;

  console.log(`[Payments Cron] Completed: ${successCount}/${dueOrders.length} successful (${chargedCount} charged, ${invoicedCount} invoiced)`);

  return Response.json({
    success: true,
    processed: dueOrders.length,
    successful: successCount,
    charged: chargedCount,
    invoiced: invoicedCount,
    results,
  });
};

/**
 * Charge a vaulted payment method for an order using Shopify's mandate payment API
 * This actually charges the card (not just marks as paid)
 */
async function chargeVaultedCard(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  shopifyOrderId: string,
  paymentMethodId: string,
  _amountCents: number
): Promise<{ success: boolean; error?: string }> {
  // Get the payment method details from our database
  const paymentMethod = await prisma.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    select: {
      externalMethodId: true,
      provider: true,
      isActive: true,
    },
  });

  if (!paymentMethod) {
    return { success: false, error: "Payment method not found" };
  }

  if (!paymentMethod.isActive) {
    return { success: false, error: "Payment method is no longer active" };
  }

  // Use orderCreateMandatePayment to charge the vaulted card
  // autoCapture: true means authorize and capture immediately
  try {
    const idempotencyKey = `cron_${shopifyOrderId}_${Date.now()}`;

    const response = await admin.graphql(`
      mutation OrderCreateMandatePayment(
        $id: ID!
        $paymentMethodId: ID!
        $idempotencyKey: String!
        $autoCapture: Boolean
      ) {
        orderCreateMandatePayment(
          id: $id
          paymentMethodId: $paymentMethodId
          idempotencyKey: $idempotencyKey
          autoCapture: $autoCapture
        ) {
          job {
            id
            done
          }
          paymentReferenceId
          userErrors {
            field
            message
            code
          }
        }
      }
    `, {
      variables: {
        id: `gid://shopify/Order/${shopifyOrderId}`,
        paymentMethodId: `gid://shopify/CustomerPaymentMethod/${paymentMethod.externalMethodId}`,
        idempotencyKey,
        autoCapture: true, // Capture immediately for NET_X due payments
      },
    });

    const data = await response.json();
    const result = data.data?.orderCreateMandatePayment;

    if (result?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    console.log(`[Payments Cron] Payment captured for order ${shopifyOrderId}:`, {
      paymentReferenceId: result?.paymentReferenceId,
      jobId: result?.job?.id,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a payment invoice for an order using Shopify's draft order invoice
 */
async function sendPaymentInvoice(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  shopifyDraftOrderId: string,
  email?: string | null
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  if (!shopifyDraftOrderId) {
    return { success: false, error: "No draft order ID for invoice" };
  }

  try {
    // Use draftOrderInvoiceSend to email the invoice to the customer
    const response = await admin.graphql(`
      mutation draftOrderInvoiceSend($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            id
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        id: `gid://shopify/DraftOrder/${shopifyDraftOrderId}`,
        email: email ? { to: email } : undefined,
      },
    });

    const data = await response.json();
    const result = data.data?.draftOrderInvoiceSend;

    if (result?.userErrors?.length > 0) {
      return {
        success: false,
        error: result.userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    // Return the invoice URL as the invoice ID
    return {
      success: true,
      invoiceId: result?.draftOrder?.invoiceUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Also support GET for testing
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (APP_SECRET && secret !== APP_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get count of orders that would be processed
  const now = new Date();
  const dueOrderCount = await prisma.order.count({
    where: {
      status: "PENDING",
      paidAt: null,
      OR: [
        { paymentDueDate: { lte: now } },
        {
          paymentTerms: "DUE_ON_ORDER",
          paymentMethodId: null,
          shopifyInvoiceId: null,
        },
      ],
    },
  });

  return Response.json({
    message: "Payments cron endpoint. POST to process due payments.",
    currentDate: now.toISOString(),
    dueOrders: dueOrderCount,
  });
};
