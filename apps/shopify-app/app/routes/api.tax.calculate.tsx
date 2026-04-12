import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { toGid } from "../lib/shopify-ids";

/**
 * Tax Calculation API
 *
 * Uses Shopify's draftOrderCalculate mutation to get accurate tax estimates
 * without creating an actual draft order.
 */

interface TaxLineItem {
  variantId?: string;
  title: string;
  quantity: number;
  originalUnitPrice: string;
}

interface TaxAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
}

interface TaxCalculateRequest {
  lineItems: Array<{
    shopifyVariantId?: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  shippingAddress?: TaxAddress | null;
  customerId?: string | null;
  shippingCents?: number;
}

export interface TaxLine {
  title: string;
  rate: number;
  amountCents: number;
}

export type TaxCalculateResponse = {
  success: true;
  taxCents: number;
  taxLines: TaxLine[];
} | {
  success: false;
  error: string;
};

const DRAFT_ORDER_CALCULATE_MUTATION = `#graphql
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
        lineItemsSubtotalPrice {
          shopMoney {
            amount
          }
        }
        totalPrice
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body: TaxCalculateRequest = await request.json();
    const { lineItems, shippingAddress, customerId, shippingCents } = body;

    if (!lineItems || lineItems.length === 0) {
      return Response.json({ success: false, error: "No line items provided" });
    }

    // Build line items for Shopify
    const shopifyLineItems: TaxLineItem[] = lineItems.map((li) => ({
      ...(li.shopifyVariantId && { variantId: toGid("ProductVariant", li.shopifyVariantId) }),
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
        address1: shippingAddress.address1 || "",
        address2: shippingAddress.address2 || undefined,
        city: shippingAddress.city || "",
        province: shippingAddress.province || "",
        zip: shippingAddress.zip || "",
        country: shippingAddress.countryCode || shippingAddress.country || "US",
      };
    }

    // Add customer if provided (for tax exemptions)
    if (customerId) {
      input.purchasingEntity = {
        customerId: toGid("Customer", customerId),
      };
    }

    // Add shipping line if shipping cost provided
    if (shippingCents !== undefined && shippingCents > 0) {
      input.shippingLine = {
        title: "Shipping",
        price: (shippingCents / 100).toFixed(2),
      };
    }

    const response = await admin.graphql(DRAFT_ORDER_CALCULATE_MUTATION, {
      variables: { input },
    });

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
      console.error("Shopify tax calculation errors:", errors);
      return Response.json({
        success: false,
        error: errors.map((e) => e.message).join(", "),
      });
    }

    const calculatedOrder = result.data?.draftOrderCalculate?.calculatedDraftOrder;
    if (!calculatedOrder) {
      return Response.json({
        success: false,
        error: "Failed to calculate taxes",
      });
    }

    // Convert tax amount to cents
    const taxCents = Math.round(parseFloat(calculatedOrder.totalTax) * 100);

    // Map tax lines
    const taxLines: TaxLine[] = calculatedOrder.taxLines.map((tl) => ({
      title: tl.title,
      rate: tl.rate,
      amountCents: Math.round(parseFloat(tl.priceSet.shopMoney.amount) * 100),
    }));

    return Response.json({
      success: true,
      taxCents,
      taxLines,
    } as TaxCalculateResponse);
  } catch (error) {
    console.error("Error calculating tax:", error);
    return Response.json({
      success: false,
      error: "Failed to calculate tax",
    });
  }
};
