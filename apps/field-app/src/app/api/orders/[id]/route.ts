import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { evaluatePromotions, type CartLineItem } from '@/services/promotions';
import type { ApiError } from '@/types';

/**
 * Notify shopify-app when an order is submitted for review.
 * This allows shopify-app to take action (send notifications, auto-sync, etc.)
 */
async function notifyOrderSubmitted(order: {
  id: string;
  shopId: string;
  orderNumber: string;
  totalCents: number;
  company: { name: string };
  salesRep: { firstName: string; lastName: string };
}): Promise<void> {
  const webhookUrl = process.env.SHOPIFY_APP_URL;
  const appSecret = process.env.APP_SECRET;

  if (!webhookUrl || !appSecret) {
    console.warn('[Order Webhook] SHOPIFY_APP_URL or APP_SECRET not configured, skipping notification');
    return;
  }

  try {
    const response = await fetch(`${webhookUrl}/webhooks/internal/order-submitted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': appSecret,
      },
      body: JSON.stringify({
        orderId: order.id,
        shopId: order.shopId,
        orderNumber: order.orderNumber,
        companyName: order.company.name,
        salesRepName: `${order.salesRep.firstName} ${order.salesRep.lastName}`,
        totalCents: order.totalCents,
      }),
    });

    if (!response.ok) {
      console.error(`[Order Webhook] Failed to notify shopify-app: ${response.status} ${response.statusText}`);
    } else {
      console.log(`[Order Webhook] Successfully notified shopify-app for order ${order.orderNumber}`);
    }
  } catch (error) {
    // Don't fail the order submission if webhook fails
    console.error('[Order Webhook] Error notifying shopify-app:', error);
  }
}

interface UpdateOrderRequest {
  action: 'add_item' | 'update_item' | 'remove_item' | 'submit_for_review';
  item?: {
    lineItemId?: string;
    variantId?: string;
    productId?: string;
    title?: string;
    variantTitle?: string;
    sku?: string;
    quantity?: number;
    unitPriceCents?: number;
    imageUrl?: string;
  };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { id } = await params;

    // Find order in our database (exclude soft-deleted)
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
        deletedAt: null,
        ...(role === 'REP' && { salesRepId: repId }),
      },
      include: {
        salesRep: { select: { firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true, shopifyCompanyId: true, territory: { select: { name: true } } } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        shippingLocation: { select: { id: true, name: true, address1: true, address2: true, city: true, province: true, zipcode: true, country: true } },
        billingLocation: { select: { id: true, name: true, address1: true, address2: true, city: true, province: true, zipcode: true, country: true } },
        lineItems: true,
        timelineEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    const response = {
      id: order.id,
      orderNumber: order.orderNumber,
      shopifyOrderId: order.shopifyOrderId,
      shopifyOrderNumber: order.shopifyOrderNumber,
      companyId: order.companyId,
      company: {
        id: order.company.id,
        name: order.company.name,
        shopifyCompanyId: order.company.shopifyCompanyId,
      },
      companyName: order.company.name,
      contact: order.contact ? {
        id: order.contact.id,
        firstName: order.contact.firstName,
        lastName: order.contact.lastName,
        email: order.contact.email,
      } : null,
      shippingLocation: order.shippingLocation ? {
        id: order.shippingLocation.id,
        name: order.shippingLocation.name,
        address1: order.shippingLocation.address1,
        address2: order.shippingLocation.address2,
        city: order.shippingLocation.city,
        province: order.shippingLocation.province,
        zipcode: order.shippingLocation.zipcode,
        country: order.shippingLocation.country,
      } : null,
      billingLocation: order.billingLocation ? {
        id: order.billingLocation.id,
        name: order.billingLocation.name,
        address1: order.billingLocation.address1,
        address2: order.billingLocation.address2,
        city: order.billingLocation.city,
        province: order.billingLocation.province,
        zipcode: order.billingLocation.zipcode,
        country: order.billingLocation.country,
      } : null,
      shippingMethodId: order.shippingMethodId,
      appliedPromotionIds: order.appliedPromotionIds,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents,
      currency: order.currency,
      status: order.status,
      paymentTerms: order.paymentTerms,
      note: order.note,
      poNumber: order.poNumber,
      placedAt: order.placedAt?.toISOString() || null,
      createdAt: order.createdAt.toISOString(),
      rep: {
        name: `${order.salesRep.firstName} ${order.salesRep.lastName}`,
        email: order.salesRep.email,
      },
      territory: order.company.territory?.name || null,
      lineItems: order.lineItems.map((item) => ({
        id: item.id,
        shopifyProductId: item.shopifyProductId,
        shopifyVariantId: item.shopifyVariantId,
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
        // Promotion tracking
        isPromotionItem: item.isPromotionItem,
        promotionId: item.promotionId,
        promotionName: item.promotionName,
      })),
      timelineEvents: order.timelineEvents.map((event) => ({
        id: event.id,
        authorType: event.authorType,
        authorId: event.authorId,
        authorName: event.authorName,
        eventType: event.eventType,
        metadata: event.metadata,
        comment: event.comment,
        createdAt: event.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch order' } },
      { status: 500 }
    );
  }
}

interface ReplaceOrderRequest {
  companyId: string;
  contactId?: string;
  shippingLocationId?: string;
  billingLocationId?: string;
  lineItems: Array<{
    shopifyProductId: string;
    shopifyVariantId: string;
    sku: string | null;
    title: string;
    variantTitle: string | null;
    imageUrl?: string | null;
    quantity: number;
    unitPriceCents: number;
  }>;
  appliedPromotionIds?: string[];
  shippingMethodId?: string;
  note?: string | null;
  poNumber?: string | null;
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  taxCents?: number;
  totalCents?: number;
  currency?: string;
}

/**
 * Full order replacement (PUT) - replaces all line items and order data
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { id } = await params;
    const body = (await request.json()) as ReplaceOrderRequest;

    // Find order and verify ownership (exclude soft-deleted)
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
        deletedAt: null,
        ...(role === 'REP' && { salesRepId: repId }),
      },
    });

    if (!order) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Only allow editing DRAFT orders
    if (order.status !== 'DRAFT') {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Only DRAFT orders can be edited' } },
        { status: 400 }
      );
    }

    if (!body.lineItems || body.lineItems.length === 0) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Line items are required' } },
        { status: 400 }
      );
    }

    // Convert line items to promotion engine format
    const promotionLineItems: CartLineItem[] = body.lineItems.map((item) => ({
      variantId: item.shopifyVariantId,
      shopifyVariantId: item.shopifyVariantId,
      productId: item.shopifyProductId,
      shopifyProductId: item.shopifyProductId,
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    }));

    // Evaluate promotions
    const promoResult = await evaluatePromotions(shopId, promotionLineItems);

    // Delete existing line items and create new ones
    await prisma.$transaction(async (tx) => {
      // Delete all existing line items
      await tx.orderLineItem.deleteMany({
        where: { orderId: order.id },
      });

      // Create new line items (including free items from promotions)
      await tx.orderLineItem.createMany({
        data: promoResult.lineItems.map((item) => {
          const originalItem = body.lineItems.find((li) => li.shopifyVariantId === item.shopifyVariantId);
          const promotion = item.isFreeItem
            ? promoResult.appliedPromotions.find((p) => p.id === item.promotionId)
            : null;

          return {
            orderId: order.id,
            shopifyProductId: item.shopifyProductId,
            shopifyVariantId: item.shopifyVariantId,
            sku: originalItem?.sku || null,
            title: item.title,
            variantTitle: item.variantTitle,
            imageUrl: originalItem?.imageUrl || null,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            discountCents: item.totalDiscountCents,
            taxCents: 0,
            totalCents: item.finalPriceCents,
            // Promotion tracking
            isPromotionItem: item.isFreeItem || false,
            promotionId: item.promotionId || null,
            promotionName: promotion?.name || null,
          };
        }),
      });

      // Update order
      await tx.order.update({
        where: { id: order.id },
        data: {
          contactId: body.contactId || null,
          shippingLocationId: body.shippingLocationId || null,
          billingLocationId: body.billingLocationId || null,
          subtotalCents: body.subtotalCents ?? promoResult.subtotalCents,
          discountCents: body.discountCents ?? promoResult.orderDiscountCents,  // Only ORDER_TOTAL discounts
          shippingCents: body.shippingCents ?? 0,
          taxCents: body.taxCents ?? 0,
          totalCents: body.totalCents ?? promoResult.finalTotalCents,
          appliedPromotionIds: body.appliedPromotionIds ?? promoResult.appliedPromotions.map((p) => p.id),
          currency: body.currency ?? 'USD',
          note: body.note ?? null,
          poNumber: body.poNumber ?? null,
          shippingMethodId: body.shippingMethodId ?? null,
        },
      });
    });

    // Fetch and return updated order
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        salesRep: { select: { firstName: true, lastName: true, email: true } },
        company: { select: { name: true, territory: { select: { name: true } } } },
        lineItems: true,
        timelineEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!updatedOrder) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch updated order' } },
        { status: 500 }
      );
    }

    const response = {
      id: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      shopifyOrderId: updatedOrder.shopifyOrderId,
      shopifyOrderNumber: updatedOrder.shopifyOrderNumber,
      companyId: updatedOrder.companyId,
      companyName: updatedOrder.company.name,
      subtotalCents: updatedOrder.subtotalCents,
      discountCents: updatedOrder.discountCents,
      shippingCents: updatedOrder.shippingCents,
      taxCents: updatedOrder.taxCents,
      totalCents: updatedOrder.totalCents,
      currency: updatedOrder.currency,
      status: updatedOrder.status,
      paymentTerms: updatedOrder.paymentTerms,
      note: updatedOrder.note,
      poNumber: updatedOrder.poNumber,
      placedAt: updatedOrder.placedAt?.toISOString() || null,
      createdAt: updatedOrder.createdAt.toISOString(),
      rep: {
        name: `${updatedOrder.salesRep.firstName} ${updatedOrder.salesRep.lastName}`,
        email: updatedOrder.salesRep.email,
      },
      territory: updatedOrder.company.territory?.name || null,
      lineItems: updatedOrder.lineItems.map((item) => ({
        id: item.id,
        shopifyProductId: item.shopifyProductId,
        shopifyVariantId: item.shopifyVariantId,
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
        // Promotion tracking
        isPromotionItem: item.isPromotionItem,
        promotionId: item.promotionId,
        promotionName: item.promotionName,
      })),
      timelineEvents: updatedOrder.timelineEvents.map((event) => ({
        id: event.id,
        authorType: event.authorType,
        authorId: event.authorId,
        authorName: event.authorName,
        eventType: event.eventType,
        metadata: event.metadata,
        comment: event.comment,
        createdAt: event.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error replacing order:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update order' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { id } = await params;
    const body = (await request.json()) as UpdateOrderRequest;

    // Find order and verify ownership (exclude soft-deleted)
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
        deletedAt: null,
        ...(role === 'REP' && { salesRepId: repId }),
      },
      include: { lineItems: true },
    });

    if (!order) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Only allow editing DRAFT orders
    if (order.status !== 'DRAFT') {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Only DRAFT orders can be edited' } },
        { status: 400 }
      );
    }

    // Handle actions
    switch (body.action) {
      case 'add_item': {
        if (!body.item?.variantId) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Variant ID is required' } },
            { status: 400 }
          );
        }

        // Check if variant already exists in order
        const existingItem = order.lineItems.find(
          (li) => li.shopifyVariantId === body.item!.variantId
        );

        if (existingItem) {
          // Increment quantity
          await prisma.orderLineItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: existingItem.quantity + (body.item.quantity || 1),
              totalCents: (existingItem.quantity + (body.item.quantity || 1)) * existingItem.unitPriceCents,
            },
          });
        } else {
          // Create new line item
          const unitPriceCents = body.item.unitPriceCents || 0;
          const quantity = body.item.quantity || 1;
          await prisma.orderLineItem.create({
            data: {
              orderId: order.id,
              shopifyProductId: body.item.productId || null,
              shopifyVariantId: body.item.variantId,
              sku: body.item.sku || null,
              title: body.item.title || 'Unknown Product',
              variantTitle: body.item.variantTitle || null,
              imageUrl: body.item.imageUrl || null,
              quantity,
              unitPriceCents,
              discountCents: 0,
              taxCents: 0,
              totalCents: unitPriceCents * quantity,
            },
          });
        }
        break;
      }

      case 'update_item': {
        if (!body.item?.lineItemId) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Line item ID is required' } },
            { status: 400 }
          );
        }

        const lineItem = order.lineItems.find((li) => li.id === body.item!.lineItemId);
        if (!lineItem) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'NOT_FOUND', message: 'Line item not found' } },
            { status: 404 }
          );
        }

        const newQuantity = body.item.quantity ?? lineItem.quantity;
        if (newQuantity <= 0) {
          // Remove the item
          await prisma.orderLineItem.delete({ where: { id: lineItem.id } });
        } else {
          await prisma.orderLineItem.update({
            where: { id: lineItem.id },
            data: {
              quantity: newQuantity,
              totalCents: newQuantity * lineItem.unitPriceCents,
            },
          });
        }
        break;
      }

      case 'remove_item': {
        if (!body.item?.lineItemId) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Line item ID is required' } },
            { status: 400 }
          );
        }

        const lineItemToRemove = order.lineItems.find((li) => li.id === body.item!.lineItemId);
        if (!lineItemToRemove) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'NOT_FOUND', message: 'Line item not found' } },
            { status: 404 }
          );
        }

        await prisma.orderLineItem.delete({ where: { id: lineItemToRemove.id } });
        break;
      }

      case 'submit_for_review': {
        // Get updated line items
        const currentLineItems = await prisma.orderLineItem.findMany({
          where: { orderId: order.id },
        });

        if (currentLineItems.length === 0) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Cannot submit empty order for review' } },
            { status: 400 }
          );
        }

        // Update order status
        const submittedOrder = await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'AWAITING_REVIEW',
            placedAt: order.placedAt || new Date(),
          },
          include: {
            company: { select: { name: true } },
            salesRep: { select: { firstName: true, lastName: true } },
          },
        });

        // Notify shopify-app (fire and forget - don't block on failure)
        notifyOrderSubmitted({
          id: submittedOrder.id,
          shopId: submittedOrder.shopId,
          orderNumber: submittedOrder.orderNumber,
          totalCents: submittedOrder.totalCents,
          company: submittedOrder.company,
          salesRep: submittedOrder.salesRep,
        }).catch((err) => console.error('[Order Submit] Webhook notification failed:', err));

        break;
      }

      default:
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid action' } },
          { status: 400 }
        );
    }

    // Recalculate totals using promotion engine (except for submit_for_review which doesn't change items)
    if (body.action !== 'submit_for_review') {
      await recalculateOrderTotals(order.id, shopId);
    }

    // Fetch and return updated order
    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        salesRep: { select: { firstName: true, lastName: true, email: true } },
        company: { select: { name: true, territory: { select: { name: true } } } },
        lineItems: true,
        timelineEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!updatedOrder) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch updated order' } },
        { status: 500 }
      );
    }

    const response = {
      id: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      shopifyOrderId: updatedOrder.shopifyOrderId,
      shopifyOrderNumber: updatedOrder.shopifyOrderNumber,
      companyId: updatedOrder.companyId,
      companyName: updatedOrder.company.name,
      subtotalCents: updatedOrder.subtotalCents,
      discountCents: updatedOrder.discountCents,
      shippingCents: updatedOrder.shippingCents,
      taxCents: updatedOrder.taxCents,
      totalCents: updatedOrder.totalCents,
      currency: updatedOrder.currency,
      status: updatedOrder.status,
      paymentTerms: updatedOrder.paymentTerms,
      note: updatedOrder.note,
      poNumber: updatedOrder.poNumber,
      placedAt: updatedOrder.placedAt?.toISOString() || null,
      createdAt: updatedOrder.createdAt.toISOString(),
      rep: {
        name: `${updatedOrder.salesRep.firstName} ${updatedOrder.salesRep.lastName}`,
        email: updatedOrder.salesRep.email,
      },
      territory: updatedOrder.company.territory?.name || null,
      lineItems: updatedOrder.lineItems.map((item) => ({
        id: item.id,
        shopifyProductId: item.shopifyProductId,
        shopifyVariantId: item.shopifyVariantId,
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        totalCents: item.totalCents,
        // Promotion tracking
        isPromotionItem: item.isPromotionItem,
        promotionId: item.promotionId,
        promotionName: item.promotionName,
      })),
      timelineEvents: updatedOrder.timelineEvents.map((event) => ({
        id: event.id,
        authorType: event.authorType,
        authorId: event.authorId,
        authorName: event.authorName,
        eventType: event.eventType,
        metadata: event.metadata,
        comment: event.comment,
        createdAt: event.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update order' } },
      { status: 500 }
    );
  }
}

/**
 * Recalculate order totals using the promotion engine
 * Also handles adding/removing free items from promotions
 */
async function recalculateOrderTotals(orderId: string, shopId: string): Promise<void> {
  // Get current line items (both regular and promotion items)
  const allLineItems = await prisma.orderLineItem.findMany({
    where: { orderId },
  });

  // Separate regular items from promotion/free items
  const regularItems = allLineItems.filter((li) => !li.isPromotionItem);
  const existingPromoItems = allLineItems.filter((li) => li.isPromotionItem);

  if (regularItems.length === 0) {
    // No regular items - delete any promotion items and reset totals
    if (existingPromoItems.length > 0) {
      await prisma.orderLineItem.deleteMany({
        where: { orderId, isPromotionItem: true },
      });
    }
    await prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        appliedPromotionIds: [],
      },
    });
    return;
  }

  // Look up internal product/variant IDs for promotion evaluation
  const variantIds = regularItems
    .map((li) => li.shopifyVariantId)
    .filter((id): id is string => id !== null);

  const variants = await prisma.productVariant.findMany({
    where: { shopifyVariantId: { in: variantIds } },
    include: { product: true },
  });

  const variantMap = new Map(variants.map((v) => [v.shopifyVariantId, v]));

  // Convert regular items to promotion engine format
  const promotionLineItems: CartLineItem[] = regularItems.map((li) => {
    const variant = li.shopifyVariantId ? variantMap.get(li.shopifyVariantId) : null;
    return {
      variantId: variant?.id || li.id,
      shopifyVariantId: li.shopifyVariantId || '',
      productId: variant?.product?.id || li.id,
      shopifyProductId: li.shopifyProductId || '',
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
    };
  });

  // Evaluate promotions
  const result = await evaluatePromotions(shopId, promotionLineItems);

  // Delete existing promotion items (they'll be re-created if still applicable)
  if (existingPromoItems.length > 0) {
    await prisma.orderLineItem.deleteMany({
      where: { orderId, isPromotionItem: true },
    });
  }

  // Update regular line items with discounts
  for (const promoItem of result.lineItems) {
    if (promoItem.isFreeItem) continue; // Skip free items, handle separately

    // Find the matching regular line item by shopifyVariantId
    const lineItem = regularItems.find(
      (li) => li.shopifyVariantId === promoItem.shopifyVariantId
    );
    if (lineItem) {
      await prisma.orderLineItem.update({
        where: { id: lineItem.id },
        data: {
          discountCents: promoItem.totalDiscountCents,
          totalCents: promoItem.finalPriceCents,
        },
      });
    }
  }

  // Create new free items from promotions
  const freeItems = result.lineItems.filter((item) => item.isFreeItem);
  if (freeItems.length > 0) {
    await prisma.orderLineItem.createMany({
      data: freeItems.map((item) => {
        const promotion = result.appliedPromotions.find((p) => p.id === item.promotionId);
        return {
          orderId,
          shopifyProductId: item.shopifyProductId,
          shopifyVariantId: item.shopifyVariantId,
          sku: null,
          title: item.title,
          variantTitle: item.variantTitle,
          imageUrl: null,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          discountCents: item.totalDiscountCents,
          taxCents: 0,
          totalCents: item.finalPriceCents,
          isPromotionItem: true,
          promotionId: item.promotionId || null,
          promotionName: promotion?.name || null,
        };
      }),
    });
  }

  // Update order totals and applied promotions
  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotalCents: result.subtotalCents,
      discountCents: result.orderDiscountCents,  // Only ORDER_TOTAL discounts
      totalCents: result.finalTotalCents,
      appliedPromotionIds: result.appliedPromotions.map((p) => p.id),
    },
  });
}

/**
 * Soft delete an order (only DRAFT or AWAITING_REVIEW orders that are not in Shopify)
 * Sets deletedAt timestamp and adds a timeline event
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { id } = await params;

    // Find order and verify ownership
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
        deletedAt: null, // Can't delete already deleted orders
        ...(role === 'REP' && { salesRepId: repId }),
      },
      include: {
        salesRep: { select: { firstName: true, lastName: true } },
      },
    });

    if (!order) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 }
      );
    }

    // Only allow deleting DRAFT or AWAITING_REVIEW orders that are not in Shopify
    if (order.shopifyOrderId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Cannot delete order that is already in Shopify. Please cancel in Shopify instead.' } },
        { status: 400 }
      );
    }

    if (order.status !== 'DRAFT' && order.status !== 'AWAITING_REVIEW') {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Only DRAFT or AWAITING_REVIEW orders can be deleted' } },
        { status: 400 }
      );
    }

    const now = new Date();
    const authorName = `${order.salesRep.firstName} ${order.salesRep.lastName}`;

    // Soft delete the order and add timeline event in a transaction
    await prisma.$transaction([
      // Set deletedAt timestamp
      prisma.order.update({
        where: { id: order.id },
        data: { deletedAt: now },
      }),
      // Add timeline event
      prisma.orderTimelineEvent.create({
        data: {
          orderId: order.id,
          authorType: role === 'REP' ? 'SALES_REP' : 'ADMIN',
          authorId: repId,
          authorName,
          eventType: 'deleted',
          metadata: { previousStatus: order.status },
          createdAt: now,
        },
      }),
    ]);

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete order' } },
      { status: 500 }
    );
  }
}
