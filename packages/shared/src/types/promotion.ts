export type PromotionType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_GET_Y';

export interface Promotion {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  type: PromotionType;
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
  totalDiscountCents: number;
}

export interface LineItemDiscount {
  promotionId: string;
  promotionName: string;
  type: PromotionType;
  discountCents: number;
  discountPerUnit: number;
}
