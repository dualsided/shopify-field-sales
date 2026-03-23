import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { shopifyGraphQL } from '@/lib/shopify/client';
import { evaluatePromotions, formatDiscountsForDraftOrder } from '@/services/promotion-engine';
import type { CartLineItem as PromotionCartLineItem } from '@/services/promotion-engine';
import type { ApiError, CartLineItem } from '@/types';

interface CreateOrderRequest {
  companyId: string;
}

interface DraftOrderCreateResponse {
  draftOrderCreate: {
    draftOrder: {
      id: string;
      name: string;
      totalPrice: string;
      currencyCode: string;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

interface DraftOrderCompleteResponse {
  draftOrderComplete: {
    draftOrder: {
      id: string;
      order: {
        id: string;
        name: string;
      } | null;
    } | null;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

const DRAFT_ORDER_CREATE_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        totalPrice
        currencyCode
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation DraftOrderComplete($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder {
        id
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

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

    // Format line items with discounts for Shopify DraftOrder
    const shopifyLineItems = formatDiscountsForDraftOrder(promoResult);

    // Create draft order in Shopify with promotions applied
    const draftOrderInput = {
      purchasingEntity: company.shopifyCompanyId ? {
        purchasingCompany: {
          companyId: company.shopifyCompanyId,
        },
      } : undefined,
      lineItems: shopifyLineItems,
      note: cart.notes || `Order placed by sales rep`,
    };

    const draftOrderResponse = await shopifyGraphQL<DraftOrderCreateResponse>(
      shopId,
      DRAFT_ORDER_CREATE_MUTATION,
      { input: draftOrderInput }
    );

    if (draftOrderResponse.draftOrderCreate.userErrors.length > 0) {
      const errorMessage = draftOrderResponse.draftOrderCreate.userErrors
        .map((e) => e.message)
        .join(', ');
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: errorMessage } },
        { status: 400 }
      );
    }

    const draftOrder = draftOrderResponse.draftOrderCreate.draftOrder;
    if (!draftOrder) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: 'Failed to create draft order' } },
        { status: 500 }
      );
    }

    // Complete the draft order to create actual order
    const completeResponse = await shopifyGraphQL<DraftOrderCompleteResponse>(
      shopId,
      DRAFT_ORDER_COMPLETE_MUTATION,
      { id: draftOrder.id }
    );

    if (completeResponse.draftOrderComplete.userErrors.length > 0) {
      const errorMessage = completeResponse.draftOrderComplete.userErrors
        .map((e) => e.message)
        .join(', ');
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: errorMessage } },
        { status: 400 }
      );
    }

    const completedDraftOrder = completeResponse.draftOrderComplete.draftOrder;
    const shopifyOrder = completedDraftOrder?.order;

    if (!shopifyOrder) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: 'Failed to complete order' } },
        { status: 500 }
      );
    }

    // Generate internal order number
    const orderCount = await prisma.order.count({ where: { shopId } });
    const orderNumber = `FS-${String(orderCount + 1).padStart(6, '0')}`;

    // Save order with line items in our database
    const order = await prisma.order.create({
      data: {
        shopId,
        salesRepId: repId,
        companyId: body.companyId,
        orderNumber,
        shopifyDraftOrderId: draftOrder.id,
        shopifyOrderId: shopifyOrder.id,
        shopifyOrderNumber: shopifyOrder.name,
        subtotalCents: promoResult.subtotalCents,
        discountCents: promoResult.totalDiscountCents,
        totalCents: promoResult.finalTotalCents,
        currency: draftOrder.currencyCode || 'USD',
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
            taxCents: 0, // Will be updated via webhook when Shopify calculates tax
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
