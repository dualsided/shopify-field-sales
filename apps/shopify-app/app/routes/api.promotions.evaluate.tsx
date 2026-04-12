import type { ActionFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getActivePromotions } from "../services/promotion.server";
import { getEnabledProducts } from "../services/product.server";
import {
  evaluatePromotions,
  type EngineLineItem,
  type PromotionInput,
  type ProductInfo,
  type EvaluationResult,
} from "@field-sales/shared";

/**
 * Promotion Evaluation API
 *
 * Evaluates cart line items against active promotions and returns
 * which promotions qualify and any free items to add.
 */

interface EvaluateRequest {
  lineItems: Array<{
    id: string;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
    title: string;
    variantTitle?: string | null;
    sku?: string | null;
    quantity: number;
    unitPriceCents: number;
    isFreeItem?: boolean;
  }>;
}

export type EvaluateResponse = {
  success: true;
  appliedPromotions: Array<{
    id: string;
    name: string;
    type: string;
    scope: string;
    discountCents: number;
  }>;
  freeItemsToAdd: Array<{
    productId: string;
    variantId: string;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    unitPriceCents: number;
    promotionId: string;
    promotionName: string;
  }>;
  totalDiscountCents: number;
} | {
  success: false;
  error: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop } = await getAuthenticatedShop(request);
    const body: EvaluateRequest = await request.json();
    const { lineItems } = body;

    if (!lineItems || lineItems.length === 0) {
      return Response.json({
        success: true,
        appliedPromotions: [],
        freeItemsToAdd: [],
        totalDiscountCents: 0,
      });
    }

    // Get active promotions for the shop
    const promotions = await getActivePromotions(shop.id);

    if (promotions.length === 0) {
      return Response.json({
        success: true,
        appliedPromotions: [],
        freeItemsToAdd: [],
        totalDiscountCents: 0,
      });
    }

    // Convert line items to engine format
    const engineLineItems: EngineLineItem[] = lineItems
      .filter((li) => !li.isFreeItem) // Exclude existing free items from evaluation
      .map((li) => ({
        id: li.id,
        productId: li.shopifyProductId || "",
        variantId: li.shopifyVariantId || "",
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        title: li.title,
        variantTitle: li.variantTitle || undefined,
        sku: li.sku || undefined,
      }));

    // Convert promotions to engine format
    const promotionInputs: PromotionInput[] = promotions.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      scope: p.scope,
      value: Number(p.value),
      minOrderCents: p.minOrderCents,
      buyQuantity: p.buyQuantity,
      buyProductIds: p.buyProductIds,
      getQuantity: p.getQuantity,
      getProductIds: p.getProductIds,
      stackable: p.stackable,
      priority: p.priority,
    }));

    // Build product catalog for free item lookups
    // Get all getProductIds from promotions that might add free items
    const freeProductIds = promotions
      .filter((p) => p.type === "BUY_X_GET_Y" || p.type === "SPEND_GET_FREE")
      .flatMap((p) => p.getProductIds || []);

    const productCatalog = new Map<string, ProductInfo>();

    if (freeProductIds.length > 0) {
      // Fetch product info for potential free items
      // getEnabledProducts returns a flattened list of variants
      const productVariants = await getEnabledProducts(shop.id);

      for (const variant of productVariants) {
        // Key by shopifyVariantId (which is what getProductIds typically contains)
        if (freeProductIds.includes(variant.shopifyVariantId)) {
          productCatalog.set(variant.shopifyVariantId, {
            productId: variant.shopifyProductId,
            variantId: variant.shopifyVariantId,
            title: variant.title,
            variantTitle: variant.variantTitle || undefined,
            priceCents: variant.priceCents,
            sku: variant.sku || undefined,
          });
        }
      }
    }

    // Evaluate promotions
    const result: EvaluationResult = evaluatePromotions(
      engineLineItems,
      promotionInputs,
      productCatalog
    );

    return Response.json({
      success: true,
      appliedPromotions: result.appliedPromotions.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        scope: p.scope,
        discountCents: p.discountCents,
      })),
      freeItemsToAdd: result.freeItemsToAdd,
      totalDiscountCents: result.totalDiscountCents,
    } as EvaluateResponse);
  } catch (error) {
    console.error("Error evaluating promotions:", error);
    return Response.json({
      success: false,
      error: "Failed to evaluate promotions",
    });
  }
};
