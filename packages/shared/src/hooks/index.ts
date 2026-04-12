/**
 * Shared Hooks
 *
 * Platform-agnostic React hooks for web and React Native.
 */

// Types - export form-specific types with new names to avoid conflicts
export type {
  CompanyOption,
  ContactOption,
  LocationOption,
  ShippingOption,
  OrderFormData,
  InitialOrderData,
  AvailablePromotion,
  // Form-specific types (prefixed)
  FormOrderStatus,
  FormPaymentTerms,
  FormOrderLineItem,
  FormAppliedPromotion,
  FormTimelineEvent,
  // Backward-compatible aliases
  OrderLineItem,
  AppliedPromotion,
  TimelineEvent,
  OrderStatus,
  PaymentTerms,
} from './types';

// Hooks
export { useOrderForm, default as useOrderFormDefault } from './useOrderForm';
export { usePromotions, default as usePromotionsDefault } from './usePromotions';
export type { UsePromotionsConfig, UsePromotionsResult } from './usePromotions';
