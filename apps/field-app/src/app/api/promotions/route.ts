import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { getProductPrices, type ProductPriceInfo } from '@/services/products';
import type { ApiError } from '@/types';

export interface PromotionListItem {
  id: string;
  name: string;
  description: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'SPEND_GET_FREE';
  scope: 'LINE_ITEM' | 'ORDER_TOTAL' | 'SHIPPING';
  value: number;
  minOrderCents: number | null;
  buyQuantity: number | null;
  buyProductIds: string[];
  getQuantity: number | null;
  getProductIds: string[];
  stackable: boolean;
  priority: number;
}

export interface PromotionsResponse {
  promotions: PromotionListItem[];
  freeItemProducts: ProductPriceInfo[];
}

export async function GET(request: Request) {
  try {
    const { shopId } = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');

    const now = new Date();

    // Fetch active promotions that are currently valid
    const promotions = await prisma.promotion.findMany({
      where: {
        shopId,
        isActive: true,
        startsAt: { lte: now },
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Collect all getProductIds (variant IDs for free items)
    const allFreeItemVariantIds: string[] = [];
    for (const promo of promotions) {
      for (const variantId of promo.getProductIds || []) {
        if (!allFreeItemVariantIds.includes(variantId)) {
          allFreeItemVariantIds.push(variantId);
        }
      }
    }

    // Get product info with catalog-aware pricing
    const freeItemProducts = await getProductPrices(
      shopId,
      allFreeItemVariantIds,
      locationId
    );

    const items: PromotionListItem[] = promotions.map((promo) => ({
      id: promo.id,
      name: promo.name,
      description: promo.description,
      type: promo.type as PromotionListItem['type'],
      scope: promo.scope as PromotionListItem['scope'],
      value: Number(promo.value),
      minOrderCents: promo.minOrderCents,
      buyQuantity: promo.buyQuantity,
      buyProductIds: promo.buyProductIds,
      getQuantity: promo.getQuantity,
      getProductIds: promo.getProductIds,
      stackable: promo.stackable,
      priority: promo.priority,
    }));

    return NextResponse.json({
      data: { promotions: items, freeItemProducts },
      error: null,
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch promotions',
        },
      },
      { status: 500 }
    );
  }
}
