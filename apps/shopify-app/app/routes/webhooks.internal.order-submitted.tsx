import type { ActionFunctionArgs } from "react-router";
import { prisma } from "@field-sales/database";

/**
 * Internal webhook endpoint for field-app to notify shopify-app
 * when an order is submitted for review.
 *
 * This endpoint is NOT a Shopify webhook - it's an internal communication
 * channel between field-app and shopify-app.
 */

interface OrderSubmittedPayload {
  orderId: string;
  shopId: string;
  orderNumber: string;
  companyName?: string;
  salesRepName?: string;
  totalCents?: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only accept POST
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify app secret
  const secret = request.headers.get("x-app-secret");
  const expectedSecret = process.env.APP_SECRET;

  if (!expectedSecret) {
    console.error("[Internal Webhook] APP_SECRET not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  if (secret !== expectedSecret) {
    console.error("[Internal Webhook] Invalid secret");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload: OrderSubmittedPayload = await request.json();

    if (!payload.orderId || !payload.shopId) {
      return new Response("Missing required fields", { status: 400 });
    }

    console.log(
      `[Internal Webhook] Order submitted for review: ${payload.orderNumber} (${payload.orderId})`
    );

    // Verify order exists and is in AWAITING_REVIEW status
    const order = await prisma.order.findFirst({
      where: {
        id: payload.orderId,
        shopId: payload.shopId,
        status: "AWAITING_REVIEW",
      },
      include: {
        company: { select: { name: true } },
        salesRep: { select: { firstName: true, lastName: true, email: true } },
        shop: { select: { shopifyDomain: true, shopName: true } },
      },
    });

    if (!order) {
      console.error(
        `[Internal Webhook] Order not found or not in AWAITING_REVIEW status: ${payload.orderId}`
      );
      return new Response("Order not found or invalid status", { status: 404 });
    }

    // =========================================================================
    // Actions to take when order is submitted for review
    // =========================================================================

    // 1. Log the submission
    console.log(`[Internal Webhook] Processing order submission:`, {
      orderNumber: order.orderNumber,
      company: order.company.name,
      salesRep: `${order.salesRep.firstName} ${order.salesRep.lastName}`,
      total: `$${(order.totalCents / 100).toFixed(2)}`,
      shop: order.shop.shopifyDomain,
    });

    // 2. TODO: Send notification email to admin
    // await sendOrderSubmissionEmail({
    //   shopDomain: order.shop.shopifyDomain,
    //   orderNumber: order.orderNumber,
    //   companyName: order.company.name,
    //   salesRepName: `${order.salesRep.firstName} ${order.salesRep.lastName}`,
    //   totalCents: order.totalCents,
    // });

    // 3. TODO: Optionally auto-sync to Shopify as draft order
    // This could be enabled via shop settings
    // if (shop.autoSyncOrders) {
    //   await syncOrderToShopifyDraft(payload.shopId, payload.orderId, admin);
    // }

    // 4. TODO: Update any real-time dashboards via websocket/SSE
    // await notifyDashboard(payload.shopId, 'order_submitted', order);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Internal Webhook] Error processing order submission:", error);
    return new Response("Internal server error", { status: 500 });
  }
};

// Reject other HTTP methods
export const loader = () => {
  return new Response("Method not allowed", { status: 405 });
};
