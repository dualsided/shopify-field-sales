export type CartStatus = 'ACTIVE' | 'SUBMITTED' | 'ABANDONED';

export interface CartLineItem {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  imageUrl: string | null;
}

export interface CartSession {
  id: string;
  shopId: string;
  repId: string;
  companyId: string;
  lineItems: CartLineItem[];
  discountCodes: string[];
  notes: string | null;
  status: CartStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartSummary {
  itemCount: number;
  subtotal: string;
  currency: string;
}
