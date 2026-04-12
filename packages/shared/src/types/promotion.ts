export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y' | 'SPEND_GET_FREE';

/**
 * Where the promotion discount is applied:
 * - LINE_ITEM: Adds free items to order (BUY_X_GET_Y, SPEND_GET_FREE)
 * - ORDER_TOTAL: Discounts off subtotal (PERCENTAGE, FIXED_AMOUNT)
 * - SHIPPING: Discounts off shipping cost
 */
export type PromotionScope = 'LINE_ITEM' | 'ORDER_TOTAL' | 'SHIPPING';

export interface Promotion {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  type: PromotionType;
  scope: PromotionScope;
  value: number; // For PERCENTAGE: 10 = 10%, for FIXED_AMOUNT: 10 = $10

  // Conditions
  minQuantity: number | null;
  minOrderCents: number | null;
  productIds: string[]; // Empty = all products

  // Buy X Get Y specific
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscount: number | null; // Percentage: 100 = free, 50 = 50% off

  // Validity
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  priority: number;
  stackable: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface PromotionListItem {
  id: string;
  name: string;
  type: PromotionType;
  value: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  priority: number;
  stackable: boolean;
}

export interface CreatePromotionRequest {
  name: string;
  description?: string;
  type: PromotionType;
  value: number;

  // Conditions
  minQuantity?: number;
  minOrderCents?: number;
  productIds?: string[];

  // Buy X Get Y
  buyQuantity?: number;
  getQuantity?: number;
  getDiscount?: number;

  // Validity
  startsAt: string; // ISO date string
  endsAt?: string;
  priority?: number;
  stackable?: boolean;
}

export interface UpdatePromotionRequest {
  name?: string;
  description?: string;
  type?: PromotionType;
  value?: number;

  minQuantity?: number | null;
  minOrderCents?: number | null;
  productIds?: string[];

  buyQuantity?: number | null;
  getQuantity?: number | null;
  getDiscount?: number | null;

  startsAt?: string;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
  stackable?: boolean;
}

// Applied promotion result for cart display
export interface AppliedPromotion {
  id: string;
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  totalDiscountCents: number;
}

export interface LineItemDiscount {
  promotionId: string;
  promotionName: string;
  type: PromotionType;
  discountCents: number;
  discountPerUnit: number;
}
