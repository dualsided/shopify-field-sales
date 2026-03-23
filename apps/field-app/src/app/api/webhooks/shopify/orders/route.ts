import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyWebhook, parseWebhookBody } from '@/lib/shopify/webhook';
import type { OrderStatus } from '.prisma/field-app-client';

interface ShopifyOrderWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string; // e.g., "#1001"
  number: number;
  order_number: number;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  total_shipping_price_set?: {
    shop_money: { amount: string };
  };
  currency: string;
  financial_status: string; // pending, authorized, paid, partially_paid, refunded, etc.
  fulfillment_status: string | null; // null, fulfilled, partial, restocked
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  company?: {
    id: number;
    location_id: number;
  } | null;
}

export async function POST(request: Request) {
  try {
    // Verify webhook signature
    const { valid, shop, topic, rawBody } = await verifyWebhook(request);

    if (!valid) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!shop || !rawBody) {
      console.error('Missing shop or body');
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    // Find shop by shop domain
    const shopRecord = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopRecord) {
      console.error(`Shop not found for shop: ${shop}`);
      // Return 200 to acknowledge webhook even if shop not found
      return NextResponse.json({ received: true, status: 'shop_not_found' });
    }

    const payload = parseWebhookBody<ShopifyOrderWebhookPayload>(rawBody);
    if (!payload) {
      console.error('Invalid webhook payload');
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Handle different webhook topics
    switch (topic) {
      case 'orders/create':
        await handleOrderCreate(shopRecord.id, payload);
        break;

      case 'orders/updated':
        await handleOrderUpdate(shopRecord.id, payload);
        break;

      case 'orders/fulfilled':
        await handleOrderFulfilled(shopRecord.id, payload);
        break;

      case 'orders/paid':
        await handleOrderPaid(shopRecord.id, payload);
        break;

      case 'orders/cancelled':
        await handleOrderCancelled(shopRecord.id, payload);
        break;

      default:
        console.log(`Unhandled order webhook topic: ${topic}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Order webhook error:', error);
    // Return 200 to prevent retries for unrecoverable errors
    return NextResponse.json({ received: true, error: 'Internal error' });
  }
}

/**
 * Derive OrderStatus from Shopify financial status
 * Maps to our enum: DRAFT, PENDING, PAID, CANCELLED, REFUNDED
 */
function deriveOrderStatus(
  financialStatus: string,
  cancelledAt: string | null
): OrderStatus {
  if (cancelledAt) {
    return 'CANCELLED';
  }

  // Map financial status to our OrderStatus enum
  switch (financialStatus) {
    case 'paid':
    case 'partially_paid':
      return 'PAID';
    case 'refunded':
    case 'partially_refunded':
      return 'REFUNDED';
    case 'pending':
    case 'authorized':
    default:
      return 'PENDING';
  }
}

/**
 * Convert price string to cents
 */
function priceToCents(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

async function handleOrderCreate(
  shopId: string,
  payload: ShopifyOrderWebhookPayload
) {
  const shopifyOrderId = payload.admin_graphql_api_id;
  const shopifyCompanyId = payload.company
    ? `gid://shopify/Company/${payload.company.id}`
    : '';

  // Check if order already exists (might have been created by our app)
  const existingOrder = await prisma.order.findFirst({
    where: {
      shopId,
      shopifyOrderId,
    },
  });

  if (existingOrder) {
    // Update status and totals if order exists
    const status = deriveOrderStatus(payload.financial_status, payload.cancelled_at);

    await prisma.order.update({
      where: { id: existingOrder.id },
      data: {
        status,
        subtotalCents: priceToCents(payload.subtotal_price),
        discountCents: priceToCents(payload.total_discounts),
        taxCents: priceToCents(payload.total_tax),
        shippingCents: priceToCents(payload.total_shipping_price_set?.shop_money?.amount || '0'),
        totalCents: priceToCents(payload.total_price),
        ...(status === 'PAID' && !existingOrder.paidAt && { paidAt: new Date() }),
        ...(status === 'CANCELLED' && !existingOrder.cancelledAt && { cancelledAt: new Date() }),
        ...(status === 'REFUNDED' && !existingOrder.refundedAt && { refundedAt: new Date() }),
      },
    });

    console.log(`Order updated from webhook: ${payload.name} (${shopifyOrderId})`);
    return;
  }

  // If order doesn't exist and has a company, create it
  // This handles orders created outside our app (e.g., directly in Shopify admin)
  if (shopifyCompanyId) {
    // Find the company
    const company = await prisma.company.findFirst({
      where: {
        shopId,
        shopifyCompanyId,
      },
    });

    if (!company) {
      console.log(`Company not found for order: ${shopifyCompanyId}`);
      return;
    }

    // Find a default rep (admin or first active rep)
    const defaultRep = await prisma.salesRep.findFirst({
      where: {
        shopId,
        isActive: true,
      },
      orderBy: [
        { role: 'desc' }, // ADMIN first
        { createdAt: 'asc' },
      ],
    });

    if (defaultRep) {
      const status = deriveOrderStatus(payload.financial_status, payload.cancelled_at);

      // Generate internal order number
      const orderCount = await prisma.order.count({ where: { shopId } });
      const orderNumber = `FS-${String(orderCount + 1).padStart(6, '0')}`;

      await prisma.order.create({
        data: {
          shopId,
          salesRepId: company.assignedRepId || defaultRep.id,
          companyId: company.id,
          orderNumber,
          shopifyOrderId,
          shopifyOrderNumber: payload.name,
          subtotalCents: priceToCents(payload.subtotal_price),
          discountCents: priceToCents(payload.total_discounts),
          taxCents: priceToCents(payload.total_tax),
          shippingCents: priceToCents(payload.total_shipping_price_set?.shop_money?.amount || '0'),
          totalCents: priceToCents(payload.total_price),
          currency: payload.currency,
          status,
          paymentTerms: company.paymentTerms,
          placedAt: new Date(payload.created_at),
          ...(status === 'PAID' && { paidAt: new Date() }),
        },
      });

      console.log(`Order created from webhook: ${payload.name} (${shopifyOrderId})`);
    }
  }
}

async function handleOrderUpdate(
  shopId: string,
  payload: ShopifyOrderWebhookPayload
) {
  const shopifyOrderId = payload.admin_graphql_api_id;
  const status = deriveOrderStatus(payload.financial_status, payload.cancelled_at);

  const result = await prisma.order.updateMany({
    where: {
      shopId,
      shopifyOrderId,
    },
    data: {
      status,
      subtotalCents: priceToCents(payload.subtotal_price),
      discountCents: priceToCents(payload.total_discounts),
      taxCents: priceToCents(payload.total_tax),
      shippingCents: priceToCents(payload.total_shipping_price_set?.shop_money?.amount || '0'),
      totalCents: priceToCents(payload.total_price),
    },
  });

  if (result.count > 0) {
    console.log(`Order status updated: ${payload.name} -> ${status}`);
  } else {
    // Order might not exist in our system, create it
    await handleOrderCreate(shopId, payload);
  }
}

async function handleOrderFulfilled(
  shopId: string,
  payload: ShopifyOrderWebhookPayload
) {
  // Note: We don't have FULFILLED status in our enum
  // Fulfilled orders remain as PAID since fulfillment is tracked in Shopify
  const shopifyOrderId = payload.admin_graphql_api_id;

  console.log(`Order fulfilled (tracked in Shopify): ${payload.name} (${shopifyOrderId})`);
}

async function handleOrderPaid(
  shopId: string,
  payload: ShopifyOrderWebhookPayload
) {
  const shopifyOrderId = payload.admin_graphql_api_id;

  const result = await prisma.order.updateMany({
    where: {
      shopId,
      shopifyOrderId,
      status: { not: 'CANCELLED' }, // Don't update cancelled orders
    },
    data: {
      status: 'PAID',
      paidAt: new Date(),
    },
  });

  if (result.count > 0) {
    console.log(`Order paid: ${payload.name}`);
  }
}

async function handleOrderCancelled(
  shopId: string,
  payload: ShopifyOrderWebhookPayload
) {
  const shopifyOrderId = payload.admin_graphql_api_id;

  const result = await prisma.order.updateMany({
    where: {
      shopId,
      shopifyOrderId,
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  if (result.count > 0) {
    console.log(`Order cancelled: ${payload.name}`);
  }
}
