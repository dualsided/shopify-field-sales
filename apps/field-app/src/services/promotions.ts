import { prisma } from '@/lib/db/prisma';
import type { Promotion } from '@field-sales/database';
import {
  evaluatePromotions as evaluatePromotionsEngine,
  type PromotionType,
  type PromotionScope,
  type PromotionInput,
  type EngineLineItem,
  type ProductInfo,
} from '@field-sales/shared/services';

export interface CartLineItem {
  variantId: string; // Internal variant ID
  shopifyVariantId: string;
  productId: string; // Internal product ID
  shopifyProductId: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPriceCents: number;
}

export interface LineItemDiscount {
  promotionId: string;
  promotionName: string;
  type: PromotionType;
  discountCents: number;
  discountPerUnit: number; // For display purposes
}

export interface CartLineItemWithDiscount extends CartLineItem {
  discounts: LineItemDiscount[];
  totalDiscountCents: number;
  finalPriceCents: number; // unitPriceCents * quantity - totalDiscountCents
  isFreeItem?: boolean;
  promotionId?: string;
}

export interface PromotionEvaluationResult {
  lineItems: CartLineItemWithDiscount[];
  grossSubtotalCents: number;       // Sum of line items at full price (before any discounts)
  subtotalCents: number;            // Net subtotal (after LINE_ITEM discounts)
  lineItemDiscountCents: number;    // LINE_ITEM scope discounts (included in subtotal)
  orderDiscountCents: number;       // ORDER_TOTAL scope discounts (shown separately)
  totalDiscountCents: number;       // All discounts combined
  finalTotalCents: number;
  appliedPromotions: Array<{
    id: string;
    name: string;
    type: PromotionType;
    scope: PromotionScope;          // LINE_ITEM or ORDER_TOTAL
    totalDiscountCents: number;
  }>;
}

/**
 * Get active promotions for a shop at the current time
 */
export async function getActivePromotions(shopId: string): Promise<Promotion[]> {
  const now = new Date();

  return prisma.promotion.findMany({
    where: {
      shopId,
      isActive: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { priority: 'desc' }, // Higher priority first
  });
}

/**
 * Convert database promotion to engine input format
 */
function toPromotionInput(promotion: Promotion): PromotionInput {
  return {
    id: promotion.id,
    name: promotion.name,
    type: promotion.type as PromotionType,
    scope: promotion.scope as PromotionScope,
    value: Number(promotion.value),
    minOrderCents: promotion.minOrderCents,
    buyQuantity: promotion.buyQuantity,
    buyProductIds: promotion.buyProductIds,
    getQuantity: promotion.getQuantity,
    getProductIds: promotion.getProductIds,
    stackable: promotion.stackable,
    priority: promotion.priority,
  };
}

/**
 * Calculate order subtotal from line items
 */
function calculateSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/**
 * Evaluate and apply all applicable promotions to cart line items
 * Uses the shared promotion engine for evaluation logic
 *
 * LINE_ITEM promotions: Discount is applied to line items, reflected in subtotal
 * ORDER_TOTAL promotions: Discount shown separately after subtotal
 */
export async function evaluatePromotions(
  shopId: string,
  lineItems: CartLineItem[],
  productCatalog?: Map<string, ProductInfo>
): Promise<PromotionEvaluationResult> {
  const grossSubtotalCents = calculateSubtotal(lineItems);

  // Get active promotions from database
  const dbPromotions = await getActivePromotions(shopId);

  if (dbPromotions.length === 0) {
    return {
      lineItems: lineItems.map((item) => ({
        ...item,
        discounts: [],
        totalDiscountCents: 0,
        finalPriceCents: item.unitPriceCents * item.quantity,
      })),
      grossSubtotalCents,
      subtotalCents: grossSubtotalCents,
      lineItemDiscountCents: 0,
      orderDiscountCents: 0,
      totalDiscountCents: 0,
      finalTotalCents: grossSubtotalCents,
      appliedPromotions: [],
    };
  }

  // Convert to engine input formats
  const engineLineItems: EngineLineItem[] = lineItems.map((item) => ({
    id: item.variantId,
    productId: item.shopifyProductId,
    variantId: item.shopifyVariantId,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    title: item.title,
    variantTitle: item.variantTitle || undefined,
  }));

  const promotionInputs: PromotionInput[] = dbPromotions.map(toPromotionInput);

  // Evaluate using shared engine
  const engineResult = evaluatePromotionsEngine(engineLineItems, promotionInputs, productCatalog);

  // Separate LINE_ITEM vs ORDER_TOTAL discounts
  let lineItemDiscountCents = 0;
  let orderDiscountCents = 0;

  // Convert engine result back to line items with discount tracking
  // Only apply LINE_ITEM scope discounts to individual line items
  const lineItemDiscountMap = new Map<string, LineItemDiscount[]>();

  // Build discount map from applied promotions - ONLY for LINE_ITEM scope
  // - PERCENTAGE/FIXED_AMOUNT LINE_ITEM: Reduces line item price → reduces subtotal
  // - BUY_X_GET_Y/SPEND_GET_FREE: Adds free item at $0 → does NOT reduce subtotal
  // - ORDER_TOTAL: Shown as separate discount after subtotal
  for (const applied of engineResult.appliedPromotions) {
    // Track discount by scope
    if (applied.scope === 'LINE_ITEM') {
      // Only PERCENTAGE and FIXED_AMOUNT reduce the subtotal
      // BUY_X_GET_Y and SPEND_GET_FREE add free items, they don't reduce existing items
      if (applied.type === 'PERCENTAGE' || applied.type === 'FIXED_AMOUNT') {
        lineItemDiscountCents += applied.discountCents;
      }

      // For percentage and fixed discounts with LINE_ITEM scope, distribute to line items
      if (applied.type === 'PERCENTAGE' || applied.type === 'FIXED_AMOUNT') {
        const promotion = dbPromotions.find((p) => p.id === applied.id);
        if (!promotion) continue;

        // Distribute discount proportionally across all items
        for (const item of lineItems) {
          const itemTotal = item.unitPriceCents * item.quantity;
          const itemShare = grossSubtotalCents > 0 ? itemTotal / grossSubtotalCents : 0;
          const discountCents = Math.round(applied.discountCents * itemShare);
          const discountPerUnit = Math.round(discountCents / item.quantity);

          const existing = lineItemDiscountMap.get(item.variantId) || [];
          existing.push({
            promotionId: applied.id,
            promotionName: applied.name,
            type: applied.type,
            discountCents,
            discountPerUnit,
          });
          lineItemDiscountMap.set(item.variantId, existing);
        }
      }
    } else if (applied.scope === 'ORDER_TOTAL') {
      orderDiscountCents += applied.discountCents;
      // ORDER_TOTAL discounts are NOT distributed to line items
    }
    // SHIPPING scope handled elsewhere
  }

  // Note: Free items (from BUY_X_GET_Y, SPEND_GET_FREE) are already included in
  // applied.discountCents above, so we don't add them again here

  // Build final line items with discounts
  const itemsWithDiscounts: CartLineItemWithDiscount[] = lineItems.map((item) => {
    const discounts = lineItemDiscountMap.get(item.variantId) || [];
    const totalDiscountCents = discounts.reduce((sum, d) => sum + d.discountCents, 0);

    return {
      ...item,
      discounts,
      totalDiscountCents,
      finalPriceCents: item.unitPriceCents * item.quantity - totalDiscountCents,
    };
  });

  // Add free items from engine result
  for (const freeItem of engineResult.freeItemsToAdd) {
    itemsWithDiscounts.push({
      variantId: freeItem.variantId,
      shopifyVariantId: freeItem.variantId,
      productId: freeItem.productId,
      shopifyProductId: freeItem.productId,
      title: freeItem.title,
      variantTitle: freeItem.variantTitle || null,
      quantity: freeItem.quantity,
      unitPriceCents: freeItem.unitPriceCents,
      discounts: [{
        promotionId: freeItem.promotionId,
        promotionName: freeItem.promotionName,
        type: 'BUY_X_GET_Y', // or SPEND_GET_FREE
        discountCents: freeItem.unitPriceCents * freeItem.quantity,
        discountPerUnit: freeItem.unitPriceCents,
      }],
      totalDiscountCents: freeItem.unitPriceCents * freeItem.quantity,
      finalPriceCents: 0,
      isFreeItem: true,
      promotionId: freeItem.promotionId,
    });
  }

  // Net subtotal = gross - LINE_ITEM discounts
  const netSubtotalCents = grossSubtotalCents - lineItemDiscountCents;

  return {
    lineItems: itemsWithDiscounts,
    grossSubtotalCents,
    subtotalCents: netSubtotalCents,  // Net subtotal (after LINE_ITEM discounts)
    lineItemDiscountCents,
    orderDiscountCents,
    totalDiscountCents: engineResult.totalDiscountCents,
    finalTotalCents: netSubtotalCents - orderDiscountCents,
    appliedPromotions: engineResult.appliedPromotions.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      scope: p.scope,
      totalDiscountCents: p.discountCents,
    })),
  };
}

/**
 * Format discounts for Shopify DraftOrder line items
 * Returns discounts ready to be applied to each line item
 */
export function formatDiscountsForDraftOrder(
  result: PromotionEvaluationResult
): Array<{
  variantId: string;
  quantity: number;
  appliedDiscount?: {
    title: string;
    valueType: 'FIXED_AMOUNT' | 'PERCENTAGE';
    value: string;
  };
}> {
  return result.lineItems.map((item) => {
    // If free item, apply 100% discount
    if (item.isFreeItem) {
      return {
        variantId: item.shopifyVariantId,
        quantity: item.quantity,
        appliedDiscount: {
          title: `Free Item`,
          valueType: 'FIXED_AMOUNT' as const,
          value: (item.unitPriceCents * item.quantity / 100).toFixed(2),
        },
      };
    }

    // If no discounts, return without appliedDiscount
    if (item.totalDiscountCents === 0) {
      return {
        variantId: item.shopifyVariantId,
        quantity: item.quantity,
      };
    }

    // Combine all discounts into a single line item discount
    // Shopify DraftOrder only supports one discount per line item
    const discountNames = item.discounts.map((d) => d.promotionName).join(', ');

    return {
      variantId: item.shopifyVariantId,
      quantity: item.quantity,
      appliedDiscount: {
        title: discountNames,
        valueType: 'FIXED_AMOUNT' as const,
        value: (item.totalDiscountCents / 100).toFixed(2),
      },
    };
  });
}
