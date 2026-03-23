import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

export interface ProductListItem {
  id: string;
  shopifyProductId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  productType: string | null;
  vendor: string | null;
  variants: Array<{
    id: string;
    shopifyVariantId: string;
    title: string;
    sku: string | null;
    priceCents: number;
    available: boolean;
    inventoryQuantity: number | null;
  }>;
}

export interface ProductsResponse {
  items: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function GET(request: Request) {
  try {
    const { shopId } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));

    const skip = (page - 1) * pageSize;

    // Build where clause
    const where = {
      shopId,
      enabledForFieldApp: true,
      isActive: true,
      ...(query && {
        OR: [
          { title: { contains: query, mode: 'insensitive' as const } },
          { variants: { some: { sku: { contains: query, mode: 'insensitive' as const } } } },
        ],
      }),
    };

    const [products, totalItems] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { title: 'asc' },
        include: {
          variants: {
            orderBy: { position: 'asc' },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const items: ProductListItem[] = products.map((product) => ({
      id: product.id,
      shopifyProductId: product.shopifyProductId,
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
      productType: product.productType,
      vendor: product.vendor,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        shopifyVariantId: variant.shopifyVariantId,
        title: variant.title,
        sku: variant.sku,
        priceCents: variant.priceCents,
        available: variant.isAvailable,
        inventoryQuantity: variant.inventoryQuantity,
      })),
    }));

    const totalPages = Math.ceil(totalItems / pageSize);

    const response: ProductsResponse = {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch products',
        },
      },
      { status: 500 }
    );
  }
}
