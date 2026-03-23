import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

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
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
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
