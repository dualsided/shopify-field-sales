# Promotions

Promotion management and real-time evaluation in the Shopify app.

## Overview

Promotions are discounts that can be applied to orders. They are configured in the Shopify app and automatically evaluated when orders are created or edited in both the Shopify app and field-app.

## Promotion Types

| Type | Scope | Description |
|------|-------|-------------|
| `PERCENTAGE` | ORDER_TOTAL | X% off the order subtotal |
| `FIXED_AMOUNT` | ORDER_TOTAL | $X off the order total |
| `BUY_X_GET_Y` | LINE_ITEM | Buy X items, get Y free |
| `SPEND_GET_FREE` | LINE_ITEM | Spend minimum, get items free |

## Promotion Scope

Each promotion type has an associated scope that determines where the discount is applied:

| Scope | Applied To | Display Location | Stacking |
|-------|------------|------------------|----------|
| `LINE_ITEM` | Adds free items to order | Products section (as $0 line items) | Multiple can apply |
| `ORDER_TOTAL` | Reduces order total | Order Summary (as discount line) | Only one can apply |
| `SHIPPING` | Reduces shipping cost | (Future) | Only one can apply |

Scope is automatically assigned based on promotion type when creating or updating promotions.

### Stacking Rules

- **LINE_ITEM**: Multiple LINE_ITEM promotions can stack (e.g., "Buy 3 Get 1" can apply multiple times)
- **ORDER_TOTAL**: Only one ORDER_TOTAL promotion can apply per order (highest priority wins)
- **SHIPPING**: Only one SHIPPING promotion can apply per order

## Data Model

### Promotion

```typescript
{
  id: string;
  shopId: string;
  name: string;
  description?: string;
  type: PromotionType;
  scope: PromotionScope;       // AUTO-ASSIGNED based on type
  value: Decimal;              // Percentage or dollar amount

  // Conditions
  minOrderCents?: number;      // Minimum order total (cents)
  buyProductIds: string[];     // Products that qualify for "buy" (empty = all)

  // Buy X Get Y / Spend Get Free
  buyQuantity?: number;        // How many to buy
  getQuantity?: number;        // How many you get free
  getProductIds: string[];     // Products to give (empty = cheapest in cart)

  // Validity
  startsAt: Date;
  endsAt?: Date;
  isActive: boolean;
  priority: number;            // Higher = applied first
  stackable: boolean;          // Can combine with other promotions
}
```

## Real-Time Promotion Evaluation

Promotions are evaluated in real-time as users edit orders, without requiring a save.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ORDER FORM                                    │
├─────────────────────────────────────────────────────────────────────┤
│  User adds/removes products or changes quantities                   │
│                         │                                           │
│                         ▼ (300ms debounce)                          │
│  POST /api/promotions/evaluate                                      │
│                         │                                           │
│                         ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Server evaluates cart against active promotions              │   │
│  │ using shared promotion engine (@field-sales/shared)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                         │                                           │
│                         ▼                                           │
│  UI updates immediately:                                            │
│  - Free items added to Products section                             │
│  - Discounts shown in Order Summary                                 │
│  - Promotions Applied section lists all promotions                  │
└─────────────────────────────────────────────────────────────────────┘
```

### API Endpoint

**POST** `/api/promotions/evaluate`

Evaluates cart line items against active promotions.

#### Request

```typescript
{
  lineItems: Array<{
    id: string;
    shopifyProductId: string | null;
    shopifyVariantId: string | null;
    title: string;
    variantTitle?: string | null;
    sku?: string | null;
    quantity: number;
    unitPriceCents: number;
    isFreeItem?: boolean;
  }>;
}
```

#### Response

```typescript
{
  success: true;
  appliedPromotions: Array<{
    id: string;
    name: string;
    type: string;      // PERCENTAGE, FIXED_AMOUNT, BUY_X_GET_Y, SPEND_GET_FREE
    scope: string;     // LINE_ITEM, ORDER_TOTAL, SHIPPING
    discountCents: number;
  }>;
  freeItemsToAdd: Array<{
    productId: string;
    variantId: string;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    unitPriceCents: number;
    promotionId: string;
    promotionName: string;
  }>;
  totalDiscountCents: number;
}
```

### OrderForm Integration

The OrderForm component accepts an `onEvaluatePromotions` callback:

```tsx
<OrderForm
  onEvaluatePromotions={async (input) => {
    const response = await fetch("/api/promotions/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    return data;
  }}
  // ... other props
/>
```

When line items change:
1. Regular (non-free) items are sent to the evaluation API
2. Results are processed and form state updated
3. Free items are added with `isFreeItem: true`
4. `appliedPromotions` array is updated
5. `discountCents` is set from ORDER_TOTAL scope promotions
6. Totals are recalculated

### Deduplication

The evaluation system prevents unnecessary API calls:
- Debounced by 300ms
- Tracks last evaluated cart state
- Skips if cart hasn't changed

## Server-Side Validation

When orders are saved, promotions are re-evaluated server-side in `updateOrderLineItems()` to ensure consistency. This provides a safety net against client-side manipulation.

## Promotion Display

### Products Section

Free items appear as regular line items with:
- Price shown as "Free - {promotionName}"
- Quantity is read-only (controlled by promotion)
- Can be removed by user (won't re-add until cart changes)

### Order Summary

Shows order-level discounts:
```
Subtotal (3 items)          $150.00
Order Total Discount        -$15.00   ← ORDER_TOTAL scope
Shipping                     $10.00
Estimated Tax                 $9.45
─────────────────────────────────────
Total                       $154.45
```

### Promotions Applied Section

Lists all promotions applied to the order with consistent "$X Savings" format:
```
┌─────────────────────────────────────────────┐
│ Promotions Applied                          │
├─────────────────────────────────────────────┤
│ 🏷️ 10% Off Orders Over $100    $15.00 Savings │
│ 🎁 Buy 5 Get 1 Free             $25.00 Savings │
└─────────────────────────────────────────────┘
```

## Promotion Storage

When orders are saved, applied promotions are stored for later retrieval:

### LINE_ITEM Promotions
- Stored via line items with `isPromotionItem: true`, `promotionId`, and `promotionName`
- Free items appear as $0 line items in the order

### ORDER_TOTAL Promotions
- Stored in `order.appliedPromotionIds` array
- The `discountCents` field holds the total discount amount

### Loading Orders
When loading an order, promotions are retrieved from:
1. Line items with `promotionId` (for LINE_ITEM scope)
2. `appliedPromotionIds` field (for ORDER_TOTAL scope)
3. For legacy orders without `appliedPromotionIds`, the system re-evaluates active promotions to match the stored discount

## Key Functions

### promotion.server.ts

| Function | Description |
|----------|-------------|
| `getPromotions(shopId)` | Get all promotions for a shop |
| `getActivePromotions(shopId)` | Get active promotions within date range |
| `getPromotion(id)` | Get single promotion |
| `createPromotion(input)` | Create promotion (auto-assigns scope) |
| `updatePromotion(id, input)` | Update promotion (re-assigns scope if type changes) |
| `deletePromotion(id)` | Delete promotion |
| `togglePromotionActive(id)` | Toggle active status |

### Shared Engine

Location: `packages/shared/src/services/promotionEngine.ts`

```typescript
import { evaluatePromotions } from '@field-sales/shared';

const result = evaluatePromotions(lineItems, promotions, productCatalog);
// result.appliedPromotions - promotions that qualified
// result.freeItemsToAdd - free items to add to cart
// result.totalDiscountCents - total discount amount
```

## Routes

| Route | Purpose |
|-------|---------|
| `api.promotions.tsx` | List active promotions (GET) |
| `api.promotions.evaluate.tsx` | Evaluate cart promotions (POST) |

## Key Files

| File | Purpose |
|------|---------|
| `app/routes/api.promotions.evaluate.tsx` | Real-time evaluation endpoint |
| `app/services/promotion.server.ts` | Promotion CRUD operations |
| `app/components/OrderForm.tsx` | Promotion UI integration |
| `packages/shared/src/services/promotionEngine.ts` | Shared evaluation logic |
