export * from './types';
export * from './services';
export * from './client';
export * from './design';
export * from './components';

// Hooks - selectively export to avoid name conflicts
export {
  useOrderForm,
  useOrderFormDefault,
  usePromotions,
  usePromotionsDefault,
} from './hooks';

export type {
  UsePromotionsConfig,
  UsePromotionsResult,
  // Form-specific hook types (these are unique to hooks)
  CompanyOption,
  ContactOption,
  LocationOption,
  ShippingOption,
  OrderFormData,
  InitialOrderData,
  AvailablePromotion,
  FormOrderStatus,
  FormPaymentTerms,
  FormOrderLineItem,
  FormAppliedPromotion,
  FormTimelineEvent,
} from './hooks';
