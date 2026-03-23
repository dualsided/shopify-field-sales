import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { shopifyGraphQL } from '@/lib/shopify/client';
import type { ApiError } from '@/types';

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        sku: string | null;
        price: string;
        availableForSale: boolean;
        inventoryQuantity: number | null;
      };
    }>;
  };
}

interface ProductsQueryResponse {
  products: {
    edges: Array<{
      node: ShopifyProduct;
      cursor: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage {
            url
            altText
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                price
                availableForSale
                inventoryQuantity
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string;
  currency: string;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    available: boolean;
    inventoryQuantity: number | null;
  }>;
}

export interface ProductsResponse {
  products: ProductListItem[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

export async function GET(request: Request) {
  try {
    const { shopId } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('query') || '';
    const after = searchParams.get('after') || null;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    // Build Shopify query string
    let shopifyQuery = 'status:active';
    if (query) {
      shopifyQuery += ` AND (title:*${query}* OR sku:*${query}*)`;
    }

    const data = await shopifyGraphQL<ProductsQueryResponse>(shopId, PRODUCTS_QUERY, {
      first: limit,
      after,
      query: shopifyQuery,
    });

    const products: ProductListItem[] = data.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      imageUrl: node.featuredImage?.url || null,
      price: node.priceRangeV2.minVariantPrice.amount,
      currency: node.priceRangeV2.minVariantPrice.currencyCode,
      variants: node.variants.edges.map(({ node: variant }) => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        available: variant.availableForSale,
        inventoryQuantity: variant.inventoryQuantity,
      })),
    }));

    const response: ProductsResponse = {
      products,
      pageInfo: data.products.pageInfo,
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
