import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import { shopifyGraphQL } from '@/lib/shopify/client';
import type { ApiError } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ShopifyOrderResponse {
  order: {
    id: string;
    name: string;
    displayFinancialStatus: string;
    displayFulfillmentStatus: string;
    totalPriceSet: {
      shopMoney: {
        amount: string;
        currencyCode: string;
      };
    };
    subtotalPriceSet: {
      shopMoney: {
        amount: string;
      };
    };
    totalTaxSet: {
      shopMoney: {
        amount: string;
      };
    };
    totalShippingPriceSet: {
      shopMoney: {
        amount: string;
      };
    };
    createdAt: string;
    processedAt: string;
    note: string | null;
    shippingAddress: {
      name: string;
      address1: string;
      address2: string | null;
      city: string;
      provinceCode: string;
      zip: string;
      countryCode: string;
    } | null;
    lineItems: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          variantTitle: string | null;
          sku: string | null;
          quantity: number;
          originalUnitPriceSet: {
            shopMoney: {
              amount: string;
            };
          };
          image: {
            url: string;
          } | null;
        };
      }>;
    };
  } | null;
}

const ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
        }
      }
      totalTaxSet {
        shopMoney {
          amount
        }
      }
      totalShippingPriceSet {
        shopMoney {
          amount
        }
      }
      createdAt
      processedAt
      note
      shippingAddress {
        name
        address1
        address2
        city
        provinceCode
        zip
        countryCode
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet {
              shopMoney {
                amount
              }
            }
            image {
              url
            }
          }
        }
      }
    }
  }
`;

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

    // Fetch full order details from Shopify if we have a shopifyOrderId
    let shopifyOrder = null;
    if (order.shopifyOrderId) {
      try {
        const data = await shopifyGraphQL<ShopifyOrderResponse>(
          shopId,
          ORDER_QUERY,
          { id: order.shopifyOrderId }
        );
        shopifyOrder = data.order;
      } catch (error) {
        console.error('Error fetching Shopify order:', error);
        // Continue with local data if Shopify fetch fails
      }
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
      // Shopify data (if available)
      financialStatus: shopifyOrder?.displayFinancialStatus || null,
      fulfillmentStatus: shopifyOrder?.displayFulfillmentStatus || null,
      shippingAddress: shopifyOrder?.shippingAddress || null,
      // Line items - prefer local data, fall back to Shopify
      lineItems: order.lineItems.length > 0
        ? order.lineItems.map((item) => ({
            id: item.id,
            title: item.title,
            variantTitle: item.variantTitle,
            sku: item.sku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            discountCents: item.discountCents,
            totalCents: item.totalCents,
          }))
        : shopifyOrder?.lineItems?.edges?.map(({ node }) => ({
            id: node.id,
            title: node.title,
            variantTitle: node.variantTitle,
            sku: node.sku,
            quantity: node.quantity,
            unitPriceCents: Math.round(parseFloat(node.originalUnitPriceSet.shopMoney.amount) * 100),
            discountCents: 0,
            totalCents: Math.round(parseFloat(node.originalUnitPriceSet.shopMoney.amount) * 100) * node.quantity,
          })) || [],
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
