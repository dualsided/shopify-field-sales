import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

export interface ShippingMethodItem {
  id: string;
  title: string;
  method: string;
  priceCents: number;
}

export async function GET() {
  try {
    const { shopId } = await getAuthContext();

    // Fetch active shipping methods
    const shippingMethods = await prisma.shippingMethod.findMany({
      where: {
        shopId,
        isActive: true,
      },
      orderBy: [
        { position: 'asc' },
        { title: 'asc' },
      ],
    });

    const items: ShippingMethodItem[] = shippingMethods.map((method) => ({
      id: method.id,
      title: method.title,
      method: method.method,
      priceCents: method.priceCents,
    }));

    return NextResponse.json({ data: items, error: null });
  } catch (error) {
    console.error('Error fetching shipping methods:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch shipping methods',
        },
      },
      { status: 500 }
    );
  }
}
