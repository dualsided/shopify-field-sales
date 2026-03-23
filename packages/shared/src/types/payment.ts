export type PaymentProviderType = 'STRIPE' | 'SHOPIFY_TERMS' | 'SHOPIFY_VAULT';

export interface PaymentMethod {
  id: string;
  shopId: string;
  companyId: string;
  contactId: string | null;
  provider: PaymentProviderType;
  externalCustomerId: string | null;
  externalMethodId: string;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodDisplay {
  id: string;
  provider: PaymentProviderType;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
}

export interface VaultPaymentMethodInput {
  companyId: string;
  paymentMethodToken: string;
  setAsDefault?: boolean;
}

export interface ProcessPaymentInput {
  orderId: string;
  paymentMethodId: string;
  amount: string;
  currency: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  transactionId: string | null;
  errorMessage: string | null;
}
