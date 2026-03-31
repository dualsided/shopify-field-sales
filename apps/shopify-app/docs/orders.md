# Orders

Order management and Shopify integration in the Shopify app.

## Overview

Orders are created in field-app and synced to Shopify via this app. The admin can approve orders, trigger Shopify sync, and monitor order status.

## Order Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FIELD APP                                  │
├─────────────────────────────────────────────────────────────────────┤
│  DRAFT ──────► AWAITING_REVIEW                                     │
│  (Sales rep      (Submitted for                                    │
│   editing)        approval)                                        │
└─────────────────────────────────────────────────────────────────────┘
                        │
                        ▼ Admin approves
┌─────────────────────────────────────────────────────────────────────┐
│                        SHOPIFY APP                                  │
├─────────────────────────────────────────────────────────────────────┤
│  PENDING ──────► PAID ──────► REFUNDED                             │
│  (Invoice        (Payment     (Refund                              │
│   sent)           received)    processed)                          │
│      │                                                              │
│      └──────► CANCELLED                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Order Status

| Status | Description | Editable |
|--------|-------------|----------|
| `DRAFT` | Being edited by sales rep | Yes |
| `AWAITING_REVIEW` | Submitted for admin approval | No |
| `PENDING` | Synced to Shopify, awaiting payment | No |
| `PAID` | Payment received | No |
| `CANCELLED` | Order cancelled | No |
| `REFUNDED` | Payment refunded | No |

## Shopify Integration

### Draft Order Flow

When admin approves an order:

1. **Create Draft Order** - Order synced to Shopify as draft order
2. **Send Invoice** - Invoice emailed to customer contact
3. **Customer Pays** - Customer pays via Shopify checkout
4. **Order Created** - Draft converts to real Shopify order
5. **Webhook Updates** - Status synced back to database

### GraphQL Mutations

```typescript
// Create draft order
await admin.graphql(DRAFT_ORDER_CREATE_MUTATION, {
  variables: { input: { lineItems, shippingAddress, ... } }
});

// Send invoice
await admin.graphql(DRAFT_ORDER_INVOICE_SEND_MUTATION, {
  variables: { id, email: { to, subject, customMessage } }
});

// Complete draft order (convert to real order)
await admin.graphql(DRAFT_ORDER_COMPLETE_MUTATION, {
  variables: { id, paymentPending }
});
```

### ID Mapping

Shopify uses GIDs (Global IDs) in GraphQL. The app stores numeric IDs:

```typescript
// Shopify GID: "gid://shopify/DraftOrder/12345"
// Database:    "12345"

import { toGid, fromGid } from "../lib/shopify-ids";

// For GraphQL queries
const gid = toGid("DraftOrder", "12345"); // "gid://shopify/DraftOrder/12345"

// From webhook payload
const numericId = fromGid("gid://shopify/Order/67890"); // "67890"
```

## Webhooks

### Order Webhooks

| Topic | Trigger | Action |
|-------|---------|--------|
| `ORDERS_CREATE` | Order created | Link to local order |
| `ORDERS_PAID` | Payment received | Update status to PAID |
| `ORDERS_CANCELLED` | Order cancelled | Update status to CANCELLED |
| `ORDERS_UPDATED` | Order modified | Check for refund status |

### Draft Order Webhooks

| Topic | Trigger | Action |
|-------|---------|--------|
| `DRAFT_ORDERS_UPDATE` | Status change | Link Shopify order when completed |

### Webhook Processing

```typescript
// routes/webhooks.orders.tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  await processOrderWebhook(shop, topic, payload);

  return new Response(null, { status: 200 });
};
```

## Data Model

### Order
```typescript
{
  id: string;
  shopId: string;
  companyId: string;
  salesRepId: string;
  orderNumber: string;           // "ORD-000001"
  status: OrderStatus;

  // Shopify IDs (numeric, not GIDs)
  shopifyDraftOrderId?: string;  // "12345"
  shopifyOrderId?: string;       // "67890"
  shopifyOrderNumber?: string;   // "#1001"

  // Addresses
  shippingLocationId?: string;
  billingLocationId?: string;

  // Totals (in cents)
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;

  // Timestamps
  placedAt?: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
}
```

### OrderLineItem
```typescript
{
  id: string;
  orderId: string;
  shopifyProductId?: string;     // Numeric ID
  shopifyVariantId?: string;     // Numeric ID
  sku?: string;
  title: string;
  variantTitle?: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}
```

## Key Functions

### order.server.ts

| Function | Description |
|----------|-------------|
| `getOrders(shopId)` | List orders with filtering |
| `getOrderById(shopId, orderId)` | Get order details |
| `createOrder(input)` | Create new order |
| `updateOrderLineItems(...)` | Modify line items |
| `syncOrderToShopifyDraft(...)` | Create Shopify draft order |
| `submitOrderForPayment(...)` | Send invoice to customer |
| `completeDraftOrder(...)` | Convert draft to real order |
| `processOrderWebhook(...)` | Handle order webhook |
| `processDraftOrderWebhook(...)` | Handle draft order webhook |

## Routes

| Route | Purpose |
|-------|---------|
| `app.orders._index.tsx` | Order list |
| `app.orders.$id.tsx` | Order detail/actions |

## Billing Integration

When orders are marked PAID, they're recorded for revenue share billing:

```typescript
// In markOrderPaid()
await recordBilledOrder(orderId, billingPeriodId, planConfig.revenueSharePercent);
```

See [Billing](./billing.md) for details on revenue share calculation.
