import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { evaluatePromotions } from '@/services/promotion-engine';
import type { CartLineItem as PromotionCartLineItem } from '@/services/promotion-engine';
import type { ApiError, CartLineItem } from '@/types';

interface CreateOrderRequest {
  companyId: string;
}

export async function GET(request: Request) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const companyId = searchParams.get('companyId');

    const skip = (page - 1) * pageSize;

    const where = {
      shopId,
      ...(role === 'REP' && { salesRepId: repId }),
      ...(companyId && { companyId: companyId }),
    };

    const [orders, totalItems] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          salesRep: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const items = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      shopifyOrderId: o.shopifyOrderId,
      shopifyOrderNumber: o.shopifyOrderNumber,
      companyId: o.companyId,
      companyName: o.company.name,
      totalCents: o.totalCents,
      currency: o.currency,
      status: o.status,
      placedAt: o.placedAt,
      createdAt: o.createdAt,
      repName: `${o.salesRep.firstName} ${o.salesRep.lastName}`,
    }));

    const totalPages = Math.ceil(totalItems / pageSize);

    return NextResponse.json({
      data: {
        items,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch orders' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { shopId, repId } = await getAuthContext();
    const body = (await request.json()) as CreateOrderRequest;

    if (!body.companyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Company ID is required' } },
        { status: 400 }
      );
    }

    // Find active cart for this company
    const cart = await prisma.cartSession.findFirst({
      where: {
        shopId,
        repId,
        companyId: body.companyId,
        status: 'ACTIVE',
      },
    });

    if (!cart) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'No active cart found' } },
        { status: 404 }
      );
    }

    const cartLineItems = (cart.lineItems ?? []) as unknown as CartLineItem[];

    if (cartLineItems.length === 0) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Cart is empty' } },
        { status: 400 }
      );
    }

    // Get company info
    const company = await prisma.company.findFirst({
      where: { id: body.companyId, shopId },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Look up local product/variant IDs for promotion evaluation
    const shopifyVariantIds = cartLineItems.map((item) => item.variantId);
    const localVariants = await prisma.productVariant.findMany({
      where: {
        shopifyVariantId: { in: shopifyVariantIds },
        product: { shopId },
      },
      include: {
        product: { select: { id: true, shopifyProductId: true } },
      },
    });

    // Create a map for quick lookup
    const variantMap = new Map(
      localVariants.map((v) => [v.shopifyVariantId, v])
    );

    // Convert cart items to promotion engine format
    const promotionLineItems: PromotionCartLineItem[] = cartLineItems.map((item) => {
      const localVariant = variantMap.get(item.variantId);
      return {
        variantId: localVariant?.id || item.variantId,
        shopifyVariantId: item.variantId,
        productId: localVariant?.product.id || item.productId,
        shopifyProductId: localVariant?.product.shopifyProductId || item.productId,
        title: item.title,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        unitPriceCents: Math.round(parseFloat(item.price) * 100),
      };
    });

    // Evaluate promotions
    const promoResult = await evaluatePromotions(shopId, promotionLineItems);

    // Generate internal order number
    const orderCount = await prisma.order.count({ where: { shopId } });
    const orderNumber = `FS-${String(orderCount + 1).padStart(6, '0')}`;

    // Save order to database (shopify-app will sync to Shopify)
    const order = await prisma.order.create({
      data: {
        shopId,
        salesRepId: repId,
        companyId: body.companyId,
        orderNumber,
        // Shopify IDs will be populated by shopify-app after sync
        shopifyDraftOrderId: null,
        shopifyOrderId: null,
        shopifyOrderNumber: null,
        subtotalCents: promoResult.subtotalCents,
        discountCents: promoResult.totalDiscountCents,
        totalCents: promoResult.finalTotalCents,
        currency: 'USD',
        status: 'PENDING',
        paymentTerms: company.paymentTerms,
        note: cart.notes,
        placedAt: new Date(),
        // Create line items with discount info
        lineItems: {
          create: promoResult.lineItems.map((item) => ({
            shopifyProductId: item.shopifyProductId,
            shopifyVariantId: item.shopifyVariantId,
            sku: cartLineItems.find((c) => c.variantId === item.shopifyVariantId)?.sku || null,
            title: item.title,
            variantTitle: item.variantTitle,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            discountCents: item.totalDiscountCents,
            taxCents: 0,
            totalCents: item.finalPriceCents,
          })),
        },
      },
      include: {
        lineItems: true,
      },
    });

    // Mark cart as submitted
    await prisma.cartSession.update({
      where: { id: cart.id },
      data: { status: 'SUBMITTED' },
    });

    return NextResponse.json({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderNumber: order.shopifyOrderNumber,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        status: order.status,
        appliedPromotions: promoResult.appliedPromotions,
        lineItems: order.lineItems.map((li) => ({
          title: li.title,
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          discountCents: li.discountCents,
          totalCents: li.totalCents,
        })),
      },
      error: null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create order',
        },
      },
      { status: 500 }
    );
  }
}
