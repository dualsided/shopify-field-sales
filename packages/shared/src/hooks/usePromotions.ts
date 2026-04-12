/**
 * usePromotions Hook
 *
 * Platform-agnostic promotion evaluation hook.
 * Requires ApiClient to be passed in for platform flexibility.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  evaluatePromotions,
  type PromotionInput,
  type EngineLineItem,
  type EvaluationResult,
} from '../services/promotionEngine';
import type { FormOrderLineItem, FormAppliedPromotion, AvailablePromotion, PromotionScope } from './types';

export interface UsePromotionsConfig {
  /** Function to fetch promotions list - allows platform-specific implementation */
  fetchPromotions: () => Promise<AvailablePromotion[]>;
}

export interface UsePromotionsResult {
  availablePromotions: AvailablePromotion[];
  loading: boolean;
  evaluateCart: (lineItems: FormOrderLineItem[]) => {
    lineItems: FormOrderLineItem[];
    appliedPromotions: FormAppliedPromotion[];
    discountCents: number;
  };
}

export function usePromotions(config: UsePromotionsConfig): UsePromotionsResult {
  const [availablePromotions, setAvailablePromotions] = useState<AvailablePromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const prevPromotionIdsRef = useRef<string[]>([]);

  // Fetch active promotions on mount
  useEffect(() => {
    async function loadPromotions() {
      try {
        const promotions = await config.fetchPromotions();
        setAvailablePromotions(promotions);
      } catch (error) {
        console.error('Error fetching promotions:', error);
      } finally {
        setLoading(false);
      }
    }

    loadPromotions();
  }, [config.fetchPromotions]);

  // Evaluate cart against promotions
  const evaluateCart = useCallback(
    (lineItems: FormOrderLineItem[]) => {
      // Filter out free items for evaluation
      const regularItems = lineItems.filter((item) => !item.isFreeItem);

      if (regularItems.length === 0 || availablePromotions.length === 0) {
        return {
          lineItems: regularItems,
          appliedPromotions: [] as FormAppliedPromotion[],
          discountCents: 0,
        };
      }

      // Convert to engine format
      const engineLineItems: EngineLineItem[] = regularItems.map((item) => ({
        id: item.id,
        productId: item.shopifyProductId,
        variantId: item.shopifyVariantId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        title: item.title,
        variantTitle: item.variantTitle || undefined,
      }));

      const promotionInputs: PromotionInput[] = availablePromotions.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        scope: p.scope,
        value: p.value,
        minOrderCents: p.minOrderCents,
        buyQuantity: p.buyQuantity,
        buyProductIds: p.buyProductIds,
        getQuantity: p.getQuantity,
        getProductIds: p.getProductIds,
        stackable: p.stackable,
        priority: p.priority,
      }));

      // Evaluate
      const result: EvaluationResult = evaluatePromotions(engineLineItems, promotionInputs);

      // Convert applied promotions
      const appliedPromotions: FormAppliedPromotion[] = result.appliedPromotions.map((p: { id: string; name: string; type: string; scope: string; discountCents: number }) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        scope: p.scope as PromotionScope,
        discountCents: p.discountCents,
      }));

      // Build final line items including free items
      let finalLineItems: FormOrderLineItem[] = [...regularItems];

      if (result.freeItemsToAdd.length > 0) {
        const freeItems: FormOrderLineItem[] = result.freeItemsToAdd.map((freeItem: { promotionId: string; productId: string; variantId: string; title: string; variantTitle?: string; quantity: number; unitPriceCents: number; promotionName: string }) => ({
          id: `free_${freeItem.promotionId}_${freeItem.productId}`,
          shopifyProductId: freeItem.productId,
          shopifyVariantId: freeItem.variantId,
          sku: null,
          title: freeItem.title,
          variantTitle: freeItem.variantTitle || null,
          imageUrl: null,
          quantity: freeItem.quantity,
          unitPriceCents: freeItem.unitPriceCents,
          discountCents: freeItem.unitPriceCents * freeItem.quantity,
          totalCents: 0,
          isFreeItem: true,
          promotionId: freeItem.promotionId,
          promotionName: freeItem.promotionName,
        }));

        finalLineItems = [...regularItems, ...freeItems];
      }

      // Track promotion changes for notifications
      const newPromotionIds = appliedPromotions.map((p) => p.id);
      const addedPromotions = appliedPromotions.filter(
        (p) => !prevPromotionIdsRef.current.includes(p.id)
      );
      const removedIds = prevPromotionIdsRef.current.filter(
        (id) => !newPromotionIds.includes(id)
      );

      prevPromotionIdsRef.current = newPromotionIds;

      // Log promotion changes (can be used for toast notifications)
      if (addedPromotions.length > 0) {
        console.log('Promotions applied:', addedPromotions.map((p) => p.name).join(', '));
      }
      if (removedIds.length > 0) {
        console.log('Promotions removed');
      }

      return {
        lineItems: finalLineItems,
        appliedPromotions,
        discountCents: result.totalDiscountCents,
      };
    },
    [availablePromotions]
  );

  return {
    availablePromotions,
    loading,
    evaluateCart,
  };
}

export default usePromotions;
