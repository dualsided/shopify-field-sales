/**
 * Shared Promotion Engine
 *
 * Pure functions for evaluating promotions against cart contents.
 * No database calls - takes promotions and cart as input.
 */

import type { PromotionType, PromotionScope } from '../types/promotion';

// Re-export types for convenience
export type { PromotionType, PromotionScope };

// Input types for the engine (prefixed to avoid conflicts with cart types)
export interface EngineLineItem {
  id: string;
  productId: string;       // Shopify product ID
  variantId: string;       // Shopify variant ID
  quantity: number;
  unitPriceCents: number;
  isFreeItem?: boolean;    // True if added by promotion
  title?: string;          // Product title (for free item display)
  variantTitle?: string;   // Variant title (for free item display)
  sku?: string;            // Product SKU
}

export interface PromotionInput {
  id: string;
  name: string;
  type: PromotionType;
  scope: PromotionScope;   // LINE_ITEM, ORDER_TOTAL, or SHIPPING
  value: number;           // % for PERCENTAGE, dollars for FIXED_AMOUNT
  minOrderCents?: number | null;
  buyQuantity?: number | null;
  buyProductIds?: string[];
  getQuantity?: number | null;
  getProductIds?: string[];
  stackable: boolean;
  priority: number;
}

export interface ProductInfo {
  productId: string;
  variantId: string;
  title: string;
  variantTitle?: string;
  priceCents: number;
  sku?: string;
}

// Output types
export interface FreeItemToAdd {
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  promotionId: string;
  promotionName: string;
  title: string;           // Product title for display
  variantTitle?: string;   // Variant title for display
  sku?: string;            // Product SKU
}

export interface EngineAppliedPromotion {
  id: string;
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  discountCents: number;
  freeItems?: FreeItemToAdd[];
}

export interface EvaluationResult {
  appliedPromotions: EngineAppliedPromotion[];
  totalDiscountCents: number;
  freeItemsToAdd: FreeItemToAdd[];
}

/**
 * Calculate subtotal from line items (excluding free items)
 */
function calculateSubtotal(lineItems: EngineLineItem[]): number {
  return lineItems
    .filter(item => !item.isFreeItem)
    .reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/**
 * Check if cart has required quantity of specific products/variants
 * Supports both product-level IDs and variant-level IDs for flexibility
 */
function hasRequiredProducts(
  lineItems: EngineLineItem[],
  productOrVariantIds: string[],
  requiredQuantity: number
): boolean {
  if (!productOrVariantIds || productOrVariantIds.length === 0) {
    // No specific products required - check total quantity
    const totalQty = lineItems
      .filter(item => !item.isFreeItem)
      .reduce((sum, item) => sum + item.quantity, 0);
    return totalQty >= requiredQuantity;
  }

  // Check quantity of specific products/variants (match by either productId OR variantId)
  const qualifyingQty = lineItems
    .filter(item => !item.isFreeItem && (
      productOrVariantIds.includes(item.productId) ||
      productOrVariantIds.includes(item.variantId)
    ))
    .reduce((sum, item) => sum + item.quantity, 0);

  return qualifyingQty >= requiredQuantity;
}

/**
 * Check if a promotion qualifies based on cart contents
 */
function checkQualification(
  promotion: PromotionInput,
  lineItems: EngineLineItem[],
  subtotalCents: number
): boolean {
  switch (promotion.type) {
    case 'PERCENTAGE':
    case 'FIXED_AMOUNT':
    case 'SPEND_GET_FREE':
      // These require minimum order amount
      if (promotion.minOrderCents && subtotalCents < promotion.minOrderCents) {
        return false;
      }
      return true;

    case 'BUY_X_GET_Y':
      // Requires specific quantity of specific products
      if (!promotion.buyQuantity) return false;
      return hasRequiredProducts(
        lineItems,
        promotion.buyProductIds || [],
        promotion.buyQuantity
      );

    default:
      return false;
  }
}

/**
 * Calculate discount for PERCENTAGE type
 */
function calculatePercentageDiscount(
  promotion: PromotionInput,
  subtotalCents: number
): number {
  const percentage = promotion.value;
  return Math.round(subtotalCents * (percentage / 100));
}

/**
 * Calculate discount for FIXED_AMOUNT type
 */
function calculateFixedAmountDiscount(
  promotion: PromotionInput,
  subtotalCents: number
): number {
  const fixedAmountCents = Math.round(promotion.value * 100);
  // Don't discount more than the subtotal
  return Math.min(fixedAmountCents, subtotalCents);
}

/**
 * Calculate how many times BUY_X_GET_Y qualifies based on cart quantity
 */
function calculateQualificationRounds(
  promotion: PromotionInput,
  lineItems: EngineLineItem[]
): number {
  if (promotion.type !== 'BUY_X_GET_Y' || !promotion.buyQuantity) {
    return 1; // Other types only qualify once
  }

  const buyProductOrVariantIds = promotion.buyProductIds || [];

  // Calculate total qualifying quantity
  let qualifyingQty: number;
  if (buyProductOrVariantIds.length === 0) {
    // No specific products - count all items
    qualifyingQty = lineItems
      .filter(item => !item.isFreeItem)
      .reduce((sum, item) => sum + item.quantity, 0);
  } else {
    // Count specific products/variants (match by either productId OR variantId)
    qualifyingQty = lineItems
      .filter(item => !item.isFreeItem && (
        buyProductOrVariantIds.includes(item.productId) ||
        buyProductOrVariantIds.includes(item.variantId)
      ))
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  // Calculate rounds: e.g., 6 items / 3 buyQuantity = 2 rounds
  return Math.floor(qualifyingQty / promotion.buyQuantity);
}

/**
 * Determine free items for BUY_X_GET_Y or SPEND_GET_FREE
 */
function determineFreeItems(
  promotion: PromotionInput,
  lineItems: EngineLineItem[],
  productCatalog?: Map<string, ProductInfo>
): { freeItems: FreeItemToAdd[]; discountCents: number } {
  const freeItems: FreeItemToAdd[] = [];
  let discountCents = 0;

  const getQuantityPerRound = promotion.getQuantity || 1;
  const getProductIds = promotion.getProductIds || [];

  // Calculate how many times this promotion qualifies
  const rounds = calculateQualificationRounds(promotion, lineItems);
  const totalFreeQuantity = getQuantityPerRound * rounds;

  if (totalFreeQuantity <= 0) {
    return { freeItems, discountCents };
  }

  if (getProductIds.length === 0) {
    // No specific products - discount cheapest items in cart
    const sortedItems = [...lineItems]
      .filter(item => !item.isFreeItem)
      .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

    let remainingQty = totalFreeQuantity;
    for (const item of sortedItems) {
      if (remainingQty <= 0) break;

      const qtyToDiscount = Math.min(remainingQty, item.quantity);
      discountCents += item.unitPriceCents * qtyToDiscount;
      remainingQty -= qtyToDiscount;
    }
  } else {
    // Specific products/variants to add as free (deduplicate IDs)
    const uniqueIds = [...new Set(getProductIds)];
    for (const id of uniqueIds) {
      // Try to find in catalog (keyed by variantId)
      const productInfo = productCatalog?.get(id);

      if (productInfo) {
        freeItems.push({
          productId: productInfo.productId,
          variantId: productInfo.variantId,
          quantity: totalFreeQuantity,
          unitPriceCents: productInfo.priceCents,
          promotionId: promotion.id,
          promotionName: promotion.name,
          title: productInfo.title,
          variantTitle: productInfo.variantTitle,
          sku: productInfo.sku,
        });
        discountCents += productInfo.priceCents * totalFreeQuantity;
      } else {
        // Not in catalog - check if it's already in cart (match by productId OR variantId)
        const cartItem = lineItems.find(item =>
          item.productId === id || item.variantId === id
        );
        if (cartItem) {
          freeItems.push({
            productId: cartItem.productId,
            variantId: cartItem.variantId,
            quantity: totalFreeQuantity,
            unitPriceCents: cartItem.unitPriceCents,
            promotionId: promotion.id,
            promotionName: promotion.name,
            title: cartItem.title || 'Free Item',
            variantTitle: cartItem.variantTitle,
            sku: cartItem.sku,
          });
          discountCents += cartItem.unitPriceCents * totalFreeQuantity;
        }
        // If not in cart and not in catalog, skip
      }
    }
  }

  return { freeItems, discountCents };
}

/**
 * Evaluate all promotions against cart contents
 *
 * @param lineItems - Current cart line items
 * @param promotions - Available promotions to evaluate
 * @param productCatalog - Optional map of productId -> ProductInfo for looking up free item prices
 * @returns Evaluation result with applied promotions and free items
 */
export function evaluatePromotions(
  lineItems: EngineLineItem[],
  promotions: PromotionInput[],
  productCatalog?: Map<string, ProductInfo>
): EvaluationResult {
  // Empty cart = no promotions
  if (lineItems.length === 0 || lineItems.every(item => item.isFreeItem)) {
    return {
      appliedPromotions: [],
      totalDiscountCents: 0,
      freeItemsToAdd: [],
    };
  }

  const subtotalCents = calculateSubtotal(lineItems);

  // Sort by priority (higher first)
  const sortedPromotions = [...promotions].sort((a, b) => b.priority - a.priority);

  const appliedPromotions: EngineAppliedPromotion[] = [];
  const allFreeItems: FreeItemToAdd[] = [];
  let totalDiscountCents = 0;

  // Scope-based stacking: LINE_ITEM can stack, ORDER_TOTAL and SHIPPING cannot
  let hasAppliedOrderTotal = false;
  let hasAppliedShipping = false;

  for (const promotion of sortedPromotions) {
    // Scope-based stacking rules:
    // - LINE_ITEM: Always stacks (multiple can apply)
    // - ORDER_TOTAL: Only one can apply
    // - SHIPPING: Only one can apply
    if (promotion.scope === 'ORDER_TOTAL' && hasAppliedOrderTotal) {
      continue;
    }
    if (promotion.scope === 'SHIPPING' && hasAppliedShipping) {
      continue;
    }

    // Check if promotion qualifies
    if (!checkQualification(promotion, lineItems, subtotalCents)) {
      continue;
    }

    let discountCents = 0;
    let freeItems: FreeItemToAdd[] = [];

    switch (promotion.type) {
      case 'PERCENTAGE':
        discountCents = calculatePercentageDiscount(promotion, subtotalCents);
        break;

      case 'FIXED_AMOUNT':
        discountCents = calculateFixedAmountDiscount(promotion, subtotalCents);
        break;

      case 'BUY_X_GET_Y':
      case 'SPEND_GET_FREE': {
        const result = determineFreeItems(promotion, lineItems, productCatalog);
        freeItems = result.freeItems;
        discountCents = result.discountCents;
        break;
      }
    }

    // Only add if there's actually a discount
    if (discountCents > 0 || freeItems.length > 0) {
      appliedPromotions.push({
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        scope: promotion.scope,
        discountCents,
        freeItems: freeItems.length > 0 ? freeItems : undefined,
      });

      totalDiscountCents += discountCents;
      allFreeItems.push(...freeItems);

      // Track applied scopes for stacking rules
      if (promotion.scope === 'ORDER_TOTAL') {
        hasAppliedOrderTotal = true;
      } else if (promotion.scope === 'SHIPPING') {
        hasAppliedShipping = true;
      }
      // LINE_ITEM scope doesn't need tracking - it always stacks
    }
  }

  return {
    appliedPromotions,
    totalDiscountCents,
    freeItemsToAdd: allFreeItems,
  };
}
