/**
 * Shared Hook Types
 *
 * Platform-agnostic type definitions used by shared hooks.
 * These extend and complement the core types.
 */

// Import existing types to avoid duplication
import type { PromotionScope, PromotionType } from '../types/promotion';

// Re-export needed types
export type { PromotionScope, PromotionType };

// ============================================
// Company/Location/Contact Option Types
// ============================================

/** Company selection option */
export interface CompanyOption {
  id: string;
  name: string;
  accountNumber: string | null;
  territoryName?: string;
}

/** Contact selection option */
export interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

/** Location selection option */
export interface LocationOption {
  id: string;
  name: string;
  isPrimary: boolean;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string | null;
  phone: string | null;
  paymentTermsType?: string | null;
  paymentTermsDays?: number | null;
}

// ============================================
// Order Form Types (hook-specific)
// ============================================

/** Order status for form (extended from database) */
export type FormOrderStatus =
  | 'DRAFT'
  | 'AWAITING_REVIEW'
  | 'APPROVED'
  | 'SUBMITTED_TO_SHOPIFY'
  | 'SYNCED'
  | 'SYNC_FAILED'
  | 'CANCELLED';

/** Payment terms for form */
export type FormPaymentTerms =
  | 'DUE_ON_ORDER'
  | 'NET_7'
  | 'NET_15'
  | 'NET_30'
  | 'NET_45'
  | 'NET_60'
  | 'NET_90';

/** Order line item for form state */
export interface FormOrderLineItem {
  id: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  isFreeItem?: boolean;
  promotionId?: string;
  promotionName?: string;
}

/** Applied promotion for form display */
export interface FormAppliedPromotion {
  id: string;
  name: string;
  type: string;
  scope: PromotionScope;
  discountCents: number;
}

/** Shipping option */
export interface ShippingOption {
  id: string;
  title: string;
  priceCents: number;
}

/** Timeline event for order history */
export interface FormTimelineEvent {
  id: string;
  authorType: 'SALES_REP' | 'ADMIN' | 'SYSTEM';
  authorId: string | null;
  authorName: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  comment: string | null;
  createdAt: string;
}

/** Full order form data state */
export interface OrderFormData {
  id?: string;
  orderNumber?: string;
  status: FormOrderStatus;
  shopifyOrderId?: string | null;
  company: CompanyOption | null;
  contact: ContactOption | null;
  shippingLocation: LocationOption | null;
  billingLocation: LocationOption | null;
  lineItems: FormOrderLineItem[];
  appliedPromotions: FormAppliedPromotion[];
  selectedShippingOption: ShippingOption | null;
  note: string;
  poNumber: string;
  paymentTerms: FormPaymentTerms;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  timelineEvents: FormTimelineEvent[];
}

/** Initial data for editing an order */
export interface InitialOrderData {
  id?: string;
  orderNumber?: string;
  status?: FormOrderStatus;
  shopifyOrderId?: string | null;
  company?: CompanyOption | null;
  contact?: ContactOption | null;
  shippingLocation?: LocationOption | null;
  billingLocation?: LocationOption | null;
  lineItems?: FormOrderLineItem[];
  appliedPromotions?: FormAppliedPromotion[];
  selectedShippingOption?: ShippingOption | null;
  note?: string;
  poNumber?: string;
  paymentTerms?: FormPaymentTerms;
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  taxCents?: number;
  totalCents?: number;
  currency?: string;
  timelineEvents?: FormTimelineEvent[];
}

// ============================================
// Promotion Types (hook-specific)
// ============================================

/** Available promotion for display */
export interface AvailablePromotion {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  scope: PromotionScope;
  value: number;
  minOrderCents: number | null;
  buyQuantity: number | null;
  buyProductIds: string[];
  getQuantity: number | null;
  getProductIds: string[];
  stackable: boolean;
  priority: number;
}

// ============================================
// Backward Compatibility Aliases
// ============================================

// These aliases maintain backward compatibility with existing code
export type OrderLineItem = FormOrderLineItem;
export type AppliedPromotion = FormAppliedPromotion;
export type TimelineEvent = FormTimelineEvent;
export type OrderStatus = FormOrderStatus;
export type PaymentTerms = FormPaymentTerms;
