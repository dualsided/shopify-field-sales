import prisma from "../db.server";
import type { Promotion, PromotionType, PromotionScope } from "@field-sales/database";
import { Decimal } from "@prisma/client/runtime/library";

export type { Promotion, PromotionType, PromotionScope };

/**
 * Determine the appropriate scope for a promotion based on its type
 * - LINE_ITEM: BUY_X_GET_Y, SPEND_GET_FREE (adds free items to order)
 * - ORDER_TOTAL: PERCENTAGE, FIXED_AMOUNT (discounts off subtotal)
 * - SHIPPING: Future shipping discounts
 */
function getScopeForType(type: PromotionType): PromotionScope {
  switch (type) {
    case "PERCENTAGE":
    case "FIXED_AMOUNT":
      return "ORDER_TOTAL";
    case "BUY_X_GET_Y":
    case "SPEND_GET_FREE":
      return "LINE_ITEM";
    default:
      return "LINE_ITEM";
  }
}

export interface CreatePromotionInput {
  shopId: string;
  name: string;
  description?: string;
  type: PromotionType;
  value: number; // Percentage or cents depending on type

  // Spend threshold
  minOrderCents?: number;

  // Buy X Get Y
  buyQuantity?: number;
  buyProductIds?: string[];
  getQuantity?: number;
  getProductIds?: string[];

  // Validity
  startsAt: Date;
  endsAt?: Date;
  priority?: number;
  stackable?: boolean;
}

export interface UpdatePromotionInput {
  name?: string;
  description?: string;
  type?: PromotionType;
  value?: number;
  minOrderCents?: number;
  buyQuantity?: number;
  buyProductIds?: string[];
  getQuantity?: number;
  getProductIds?: string[];
  startsAt?: Date;
  endsAt?: Date | null;
  isActive?: boolean;
  priority?: number;
  stackable?: boolean;
}

/**
 * Get all promotions for a shop
 */
export async function getPromotions(shopId: string): Promise<Promotion[]> {
  return prisma.promotion.findMany({
    where: { shopId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Get active promotions for a shop (for order form)
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
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Get a single promotion by ID
 */
export async function getPromotion(id: string): Promise<Promotion | null> {
  return prisma.promotion.findUnique({
    where: { id },
  });
}

/**
 * Create a new promotion
 * Scope is automatically determined based on the promotion type
 */
export async function createPromotion(input: CreatePromotionInput): Promise<Promotion> {
  return prisma.promotion.create({
    data: {
      shopId: input.shopId,
      name: input.name,
      description: input.description,
      type: input.type,
      scope: getScopeForType(input.type), // Auto-assign scope based on type
      value: new Decimal(input.value),
      minOrderCents: input.minOrderCents,
      buyQuantity: input.buyQuantity,
      buyProductIds: input.buyProductIds || [],
      getQuantity: input.getQuantity,
      getProductIds: input.getProductIds || [],
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      priority: input.priority ?? 0,
      stackable: input.stackable ?? false,
    },
  });
}

/**
 * Update a promotion
 * If type changes, scope is automatically updated to match
 */
export async function updatePromotion(
  id: string,
  input: UpdatePromotionInput
): Promise<Promotion> {
  const data: Record<string, unknown> = { ...input };

  // Convert value to Decimal if provided
  if (input.value !== undefined) {
    data.value = new Decimal(input.value);
  }

  // Auto-update scope when type changes
  if (input.type !== undefined) {
    data.scope = getScopeForType(input.type);
  }

  return prisma.promotion.update({
    where: { id },
    data,
  });
}

/**
 * Delete a promotion
 */
export async function deletePromotion(id: string): Promise<void> {
  await prisma.promotion.delete({
    where: { id },
  });
}

/**
 * Toggle promotion active status
 */
export async function togglePromotionActive(id: string): Promise<Promotion> {
  const promotion = await prisma.promotion.findUniqueOrThrow({
    where: { id },
  });

  return prisma.promotion.update({
    where: { id },
    data: { isActive: !promotion.isActive },
  });
}
