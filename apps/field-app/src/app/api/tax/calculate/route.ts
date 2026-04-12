import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

/**
 * Tax Calculation API
 *
 * Uses Shopify's draftOrderCalculate mutation to get accurate tax estimates
 * without creating an actual draft order.
 */

interface TaxCalculateRequest {
  lineItems: Array<{
    shopifyVariantId?: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  shippingAddress?: {
    address1?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    countryCode?: string;
  } | null;
  customerId?: string | null;
  shippingCents?: number;
}

export interface TaxLine {
  title: string;
  rate: number;
  amountCents: number;
}

export interface TaxCalculateResponse {
  taxCents: number;
  taxLines: TaxLine[];
}

const DRAFT_ORDER_CALCULATE_MUTATION = `
  mutation DraftOrderCalculate($input: DraftOrderInput!) {
    draftOrderCalculate(input: $input) {
      calculatedDraftOrder {
        totalTax
        taxLines {
          title
          rate
          priceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function toGid(type: string, id: string | number): string {
  // If already a GID, return as-is
  if (typeof id === 'string' && id.startsWith('gid://')) {
    return id;
  }
  return `gid://shopify/${type}/${id}`;
}

export async function POST(request: Request) {
  try {
    const { shopId } = await getAuthContext();
    const body: TaxCalculateRequest = await request.json();
    const { lineItems, shippingAddress, customerId, shippingCents } = body;

    if (!lineItems || lineItems.length === 0) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'BAD_REQUEST', message: 'No line items provided' } },
        { status: 400 }
      );
    }

    // Get shop with access token
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        shopifyDomain: true,
        accessToken: true,
      },
    });

    if (!shop) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Shop not found' } },
        { status: 404 }
      );
    }

    // Build line items for Shopify
    const shopifyLineItems = lineItems.map((li) => ({
      ...(li.shopifyVariantId && { variantId: toGid('ProductVariant', li.shopifyVariantId) }),
      title: li.title,
      quantity: li.quantity,
      originalUnitPrice: (li.unitPriceCents / 100).toFixed(2),
    }));

    // Build input for draftOrderCalculate
    const input: Record<string, unknown> = {
      lineItems: shopifyLineItems,
    };

    // Add shipping address if provided
    if (shippingAddress) {
      input.shippingAddress = {
        address1: shippingAddress.address1 || '',
        city: shippingAddress.city || '',
        province: shippingAddress.province || '',
        zip: shippingAddress.zip || '',
        country: shippingAddress.countryCode || 'US',
      };
    }

    // Add customer if provided (for tax exemptions)
    if (customerId) {
      input.purchasingEntity = {
        customerId: toGid('Customer', customerId),
      };
    }

    // Add shipping line if shipping cost provided
    if (shippingCents !== undefined && shippingCents > 0) {
      input.shippingLine = {
        title: 'Shipping',
        price: (shippingCents / 100).toFixed(2),
      };
    }

    // Make GraphQL request to Shopify
    const response = await fetch(
      `https://${shop.shopifyDomain}/admin/api/2024-10/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shop.accessToken,
        },
        body: JSON.stringify({
          query: DRAFT_ORDER_CALCULATE_MUTATION,
          variables: { input },
        }),
      }
    );

    if (!response.ok) {
      console.error('Shopify API error:', response.status, response.statusText);
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: 'Failed to calculate tax' } },
        { status: 500 }
      );
    }

    const result: {
      data?: {
        draftOrderCalculate?: {
          calculatedDraftOrder?: {
            totalTax: string;
            taxLines: Array<{
              title: string;
              rate: number;
              priceSet: {
                shopMoney: {
                  amount: string;
                  currencyCode: string;
                };
              };
            }>;
          };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
    } = await response.json();

    if (result.data?.draftOrderCalculate?.userErrors?.length) {
      const errors = result.data.draftOrderCalculate.userErrors;
      console.error('Shopify tax calculation errors:', errors);
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: errors.map((e) => e.message).join(', ') } },
        { status: 400 }
      );
    }

    const calculatedOrder = result.data?.draftOrderCalculate?.calculatedDraftOrder;
    if (!calculatedOrder) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'SHOPIFY_ERROR', message: 'Failed to calculate taxes' } },
        { status: 500 }
      );
    }

    // Convert tax amount to cents
    const taxCents = Math.round(parseFloat(calculatedOrder.totalTax) * 100);

    // Map tax lines
    const taxLines: TaxLine[] = calculatedOrder.taxLines.map((tl) => ({
      title: tl.title,
      rate: tl.rate,
      amountCents: Math.round(parseFloat(tl.priceSet.shopMoney.amount) * 100),
    }));

    return NextResponse.json({
      data: { taxCents, taxLines } as TaxCalculateResponse,
      error: null,
    });
  } catch (error) {
    console.error('Error calculating tax:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate tax' } },
      { status: 500 }
    );
  }
}
