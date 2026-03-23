export type PaymentStrategy = 'SHOPIFY_TERMS' | 'STRIPE_VAULT' | 'SHOPIFY_VAULT';

export interface Shop {
  id: string;
  shopifyDomain: string;
  shopName: string;
  paymentStrategy: PaymentStrategy;
  stripeAccountId: string | null;
  config: Record<string, unknown> | null;
  isActive: boolean;
  // New fields for managed companies detection
  shopifyPlan: string | null;
  hasManagedCompanies: boolean;
  planDetectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopConfig {
  defaultPaymentTermsDays?: number;
  requireApprovalAbove?: number;
  enableB2BCatalogs?: boolean;
}
