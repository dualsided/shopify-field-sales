import { prisma } from '@/lib/db/prisma';
import type { Promotion, PromotionType } from '.prisma/field-app-client';
import { Decimal } from '.prisma/field-app-client/runtime/library';

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
}

export interface PromotionEvaluationResult {
  lineItems: CartLineItemWithDiscount[];
  subtotalCents: number;
  totalDiscountCents: number;
  finalTotalCents: number;
  appliedPromotions: Array<{
    id: string;
    name: string;
    type: PromotionType;
    totalDiscountCents: number;
  }>;
}

/**
 * Get active promotions for a shop at the current time
 */
async function getActivePromotions(shopId: string): Promise<Promotion[]> {
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
 * Check if a promotion applies to a specific product
 */
function promotionAppliesToProduct(promotion: Promotion, productId: string): boolean {
  // If no productIds specified, promotion applies to all products
  if (!promotion.productIds || promotion.productIds.length === 0) {
    return true;
  }
  return promotion.productIds.includes(productId);
}

/**
 * Calculate order subtotal from line items
 */
function calculateSubtotal(lineItems: CartLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/**
 * Calculate total quantity for applicable products
 */
function calculateApplicableQuantity(lineItems: CartLineItem[], promotion: Promotion): number {
  return lineItems
    .filter((item) => promotionAppliesToProduct(promotion, item.productId))
    .reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Check if promotion conditions are met
 */
function checkPromotionConditions(
  promotion: Promotion,
  lineItems: CartLineItem[],
  subtotalCents: number
): boolean {
  // Check minimum order total
  if (promotion.minOrderCents && subtotalCents < promotion.minOrderCents) {
    return false;
  }

  // Check minimum quantity (for applicable products only)
  if (promotion.minQuantity) {
    const applicableQty = calculateApplicableQuantity(lineItems, promotion);
    if (applicableQty < promotion.minQuantity) {
      return false;
    }
  }

  return true;
}

/**
 * Apply a percentage discount to line items
 */
function applyPercentageDiscount(
  lineItems: CartLineItemWithDiscount[],
  promotion: Promotion
): number {
  let totalDiscount = 0;
  const percentageValue = new Decimal(promotion.value).toNumber();

  for (const item of lineItems) {
    if (!promotionAppliesToProduct(promotion, item.productId)) {
      continue;
    }

    const lineTotal = item.unitPriceCents * item.quantity;
    const discountCents = Math.round((lineTotal * percentageValue) / 100);
    const discountPerUnit = Math.round((item.unitPriceCents * percentageValue) / 100);

    item.discounts.push({
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      discountCents,
      discountPerUnit,
    });

    item.totalDiscountCents += discountCents;
    totalDiscount += discountCents;
  }

  return totalDiscount;
}

/**
 * Apply a fixed amount discount per item to line items
 */
function applyFixedAmountDiscount(
  lineItems: CartLineItemWithDiscount[],
  promotion: Promotion
): number {
  let totalDiscount = 0;
  const fixedValueCents = Math.round(new Decimal(promotion.value).toNumber() * 100);

  for (const item of lineItems) {
    if (!promotionAppliesToProduct(promotion, item.productId)) {
      continue;
    }

    // Fixed amount is per item, multiply by quantity
    const discountCents = Math.min(
      fixedValueCents * item.quantity,
      item.unitPriceCents * item.quantity - item.totalDiscountCents // Don't exceed item total
    );

    item.discounts.push({
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      discountCents,
      discountPerUnit: fixedValueCents,
    });

    item.totalDiscountCents += discountCents;
    totalDiscount += discountCents;
  }

  return totalDiscount;
}

/**
 * Apply a Buy X Get Y discount to line items
 * For example: Buy 5, get 1 at 100% off (free)
 */
function applyBuyXGetYDiscount(
  lineItems: CartLineItemWithDiscount[],
  promotion: Promotion
): number {
  if (!promotion.buyQuantity || !promotion.getQuantity || !promotion.getDiscount) {
    return 0;
  }

  let totalDiscount = 0;
  const buyQty = promotion.buyQuantity;
  const getQty = promotion.getQuantity;
  const getDiscountPercent = new Decimal(promotion.getDiscount).toNumber();

  for (const item of lineItems) {
    if (!promotionAppliesToProduct(promotion, item.productId)) {
      continue;
    }

    // Calculate how many "sets" of buy X get Y apply
    const totalQty = item.quantity;
    const setSize = buyQty + getQty;
    const fullSets = Math.floor(totalQty / setSize);
    const discountedItems = fullSets * getQty;

    if (discountedItems === 0) {
      continue;
    }

    // Calculate discount for the "get" items
    const discountPerItem = Math.round((item.unitPriceCents * getDiscountPercent) / 100);
    const discountCents = discountPerItem * discountedItems;

    item.discounts.push({
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      discountCents,
      discountPerUnit: discountPerItem,
    });

    item.totalDiscountCents += discountCents;
    totalDiscount += discountCents;
  }

  return totalDiscount;
}

/**
 * Evaluate and apply all applicable promotions to cart line items
 */
export async function evaluatePromotions(
  shopId: string,
  lineItems: CartLineItem[]
): Promise<PromotionEvaluationResult> {
  // Initialize line items with discount tracking
  const itemsWithDiscounts: CartLineItemWithDiscount[] = lineItems.map((item) => ({
    ...item,
    discounts: [],
    totalDiscountCents: 0,
    finalPriceCents: item.unitPriceCents * item.quantity,
  }));

  const subtotalCents = calculateSubtotal(lineItems);

  // Get active promotions
  const promotions = await getActivePromotions(shopId);

  if (promotions.length === 0) {
    return {
      lineItems: itemsWithDiscounts,
      subtotalCents,
      totalDiscountCents: 0,
      finalTotalCents: subtotalCents,
      appliedPromotions: [],
    };
  }

  const appliedPromotions: PromotionEvaluationResult['appliedPromotions'] = [];
  let totalDiscountCents = 0;
  let hasAppliedNonStackable = false;

  // Apply promotions in priority order
  for (const promotion of promotions) {
    // If a non-stackable promotion was already applied, skip non-stackable ones
    if (hasAppliedNonStackable && !promotion.stackable) {
      continue;
    }

    // Check if conditions are met
    if (!checkPromotionConditions(promotion, lineItems, subtotalCents)) {
      continue;
    }

    // Apply discount based on type
    let discountAmount = 0;

    switch (promotion.type) {
      case 'PERCENTAGE':
        discountAmount = applyPercentageDiscount(itemsWithDiscounts, promotion);
        break;
      case 'FIXED_AMOUNT':
        discountAmount = applyFixedAmountDiscount(itemsWithDiscounts, promotion);
        break;
      case 'BUY_X_GET_Y':
        discountAmount = applyBuyXGetYDiscount(itemsWithDiscounts, promotion);
        break;
    }

    if (discountAmount > 0) {
      totalDiscountCents += discountAmount;
      appliedPromotions.push({
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        totalDiscountCents: discountAmount,
      });

      if (!promotion.stackable) {
        hasAppliedNonStackable = true;
      }
    }
  }

  // Update final prices
  for (const item of itemsWithDiscounts) {
    item.finalPriceCents = item.unitPriceCents * item.quantity - item.totalDiscountCents;
  }

  return {
    lineItems: itemsWithDiscounts,
    subtotalCents,
    totalDiscountCents,
    finalTotalCents: subtotalCents - totalDiscountCents,
    appliedPromotions,
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
