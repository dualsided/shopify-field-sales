import type { PaymentTerms } from './company';

export type OrderStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';

export interface Order {
  id: string;
  shopId: string;
  companyId: string;
  salesRepId: string;
  contactId: string | null;
  shippingLocationId: string | null;
  billingLocationId: string | null;

  // Shopify integration
  shopifyDraftOrderId: string | null;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;

  // Order details
  orderNumber: string;
  status: OrderStatus;
  note: string | null;
  poNumber: string | null;

  // Totals (in cents)
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;

  // Payment
  paymentTerms: PaymentTerms;
  paymentDueDate: Date | null;
  paidAt: Date | null;

  // Timestamps
  placedAt: Date | null;
  cancelledAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderLineItem {
  id: string;
  orderId: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  fulfilledQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  shopifyOrderNumber: string | null;
  companyName: string;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  placedAt: Date | null;
  createdAt: Date;
  repName: string | null;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: ShopifyOrderLineItem[];
}

export interface ShopifyOrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  originalUnitPrice: string;
  image: {
    url: string;
    altText: string | null;
  } | null;
}
