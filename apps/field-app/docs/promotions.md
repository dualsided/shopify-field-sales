# Promotions

App-managed discounts in the Field Sales app.

## Overview

Promotions are discounts configured in the shopify-app that are automatically applied to orders. They are evaluated when orders are created or edited.

## Promotion Types

### PERCENTAGE
X% off applicable items.
```
Example: 10% off all products
- Value: 10
- Applied to line item total
```

### FIXED_AMOUNT
$X off per item.
```
Example: $5 off per item
- Value: 5.00
- Multiplied by quantity
```

### BUY_X_GET_Y
Buy X items, get Y at a discount.
```
Example: Buy 5, get 1 free
- buyQuantity: 5
- getQuantity: 1
- getDiscount: 100 (100% = free)
```

## Data Model

### Promotion
```typescript
{
  id: string;
  shopId: string;
  name: string;
  description?: string;
  type: PromotionType;
  value: Decimal;               // Percentage or dollar amount

  // Conditions
  minQuantity?: number;         // Minimum items required
  minOrderCents?: number;       // Minimum order total
  productIds: string[];         // Specific products (empty = all)

  // Buy X Get Y specific
  buyQuantity?: number;
  getQuantity?: number;
  getDiscount?: Decimal;        // 100 = free, 50 = 50% off

  // Validity
  startsAt: Date;
  endsAt?: Date;
  isActive: boolean;
  priority: number;             // Higher = applied first
  stackable: boolean;           // Can combine with others
}
```

## Evaluation Logic

Location: `src/services/promotion-engine.ts`

### evaluatePromotions(shopId, lineItems)

1. Fetches active promotions for shop (within date range)
2. Sorts by priority (descending)
3. For each promotion:
   - Checks conditions (min qty, min order, product eligibility)
   - If non-stackable promo already applied, skips other non-stackables
   - Applies discount based on type
4. Updates line items with discount amounts
5. Returns totals and applied promotions

### Return Value
```typescript
{
  lineItems: CartLineItemWithDiscount[];
  subtotalCents: number;
  totalDiscountCents: number;
  finalTotalCents: number;
  appliedPromotions: Array<{
    id: string;
    name: string;
    type: PromotionType;
    totalDiscountCents: number;
  }>;
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/services/promotion-engine.ts` | Promotion evaluation logic |

## Integration Points

Promotions are evaluated:
- When creating order from cart (`POST /api/orders`)
- When editing order line items (`PATCH /api/orders/[id]`)
