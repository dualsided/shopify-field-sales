import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { evaluatePromotions, type CartLineItem } from '@/services/promotion-engine';
import type { ApiError } from '@/types';

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

    // Find order in our database
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
        ...(role === 'REP' && { salesRepId: repId }),
      },
      include: {
        salesRep: { select: { firstName: true, lastName: true, email: true } },
        company: { select: { name: true, territory: { select: { name: true } } } },
        lineItems: true,
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
      companyName: order.company.name,
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

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { id } = await params;
    const body = (await request.json()) as UpdateOrderRequest;

    // Find order and verify ownership
    const order = await prisma.order.findFirst({
      where: {
        id,
        shopId,
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

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'AWAITING_REVIEW',
            placedAt: order.placedAt || new Date(),
          },
        });
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
 */
async function recalculateOrderTotals(orderId: string, shopId: string): Promise<void> {
  // Get current line items with product/variant info
  const lineItems = await prisma.orderLineItem.findMany({
    where: { orderId },
  });

  if (lineItems.length === 0) {
    // Empty order - reset totals
    await prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
      },
    });
    return;
  }

  // Look up internal product/variant IDs for promotion evaluation
  const variantIds = lineItems
    .map((li) => li.shopifyVariantId)
    .filter((id): id is string => id !== null);

  const variants = await prisma.productVariant.findMany({
    where: { shopifyVariantId: { in: variantIds } },
    include: { product: true },
  });

  const variantMap = new Map(variants.map((v) => [v.shopifyVariantId, v]));

  // Convert to promotion engine format
  const promotionLineItems: CartLineItem[] = lineItems.map((li) => {
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

  // Update line items with discounts
  for (const promoItem of result.lineItems) {
    // Find the matching line item by shopifyVariantId
    const lineItem = lineItems.find(
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

  // Update order totals
  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotalCents: result.subtotalCents,
      discountCents: result.totalDiscountCents,
      totalCents: result.finalTotalCents,
    },
  });
}
