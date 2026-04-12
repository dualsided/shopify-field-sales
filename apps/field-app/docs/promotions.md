# Promotions

App-managed discounts in the Field Sales app.

## Overview

Promotions are discounts configured in the shopify-app that are automatically applied to orders. They are evaluated when orders are created or edited.

The promotion evaluation logic is implemented as a shared engine in `@field-sales/shared`, used by both the field-app and shopify-app.

## Promotion Types & Scope

Each promotion type has an associated **scope** that determines where the discount is applied:

| Type | Scope | Description |
|------|-------|-------------|
| `PERCENTAGE` | ORDER_TOTAL | X% off the order subtotal |
| `FIXED_AMOUNT` | ORDER_TOTAL | $X off the order total |
| `BUY_X_GET_Y` | LINE_ITEM | Buy X items, get Y free |
| `SPEND_GET_FREE` | LINE_ITEM | Spend minimum, get items free |

### Scope Behavior

| Scope | Applied To | Display | Stacking |
|-------|------------|---------|----------|
| `LINE_ITEM` | Adds free items to order | Products section (as $0 line items) | Multiple can apply |
| `ORDER_TOTAL` | Reduces order total | Order Summary (as discount line) | Only one can apply |
| `SHIPPING` | Reduces shipping cost | (Future) | Only one can apply |

### Stacking Rules

- **LINE_ITEM**: Multiple promotions can stack (e.g., "Buy 3 Get 1" applies multiple times if cart qualifies)
- **ORDER_TOTAL**: Only one ORDER_TOTAL promotion applies per order (highest priority wins)
- **SHIPPING**: Only one SHIPPING promotion applies per order

### PERCENTAGE
X% off the order subtotal.
```
Example: 10% off all products
- Value: 10
- Scope: ORDER_TOTAL
- Applied to subtotal
```

### FIXED_AMOUNT
$X off the order total.
```
Example: $5 off order
- Value: 5.00
- Scope: ORDER_TOTAL
- Applied to subtotal
```

### BUY_X_GET_Y
Buy X items, get Y free.
```
Example: Buy 5, get 1 free
- buyQuantity: 5
- buyProductIds: [] (empty = any product)
- getQuantity: 1
- getProductIds: [] (empty = cheapest items in cart)
- Scope: LINE_ITEM (adds free item)
```

### SPEND_GET_FREE
Spend minimum amount, get items free.
```
Example: Spend $100, get a free gift
- minOrderCents: 10000
- getQuantity: 1
- getProductIds: ["variant-id"] (specific products to add as free)
- Scope: LINE_ITEM (adds free item)
```

## Data Model

### Promotion (Database)
```typescript
{
  id: string;
  shopId: string;
  name: string;
  description?: string;
  type: PromotionType;
  scope: PromotionScope;        // AUTO-ASSIGNED based on type (LINE_ITEM, ORDER_TOTAL, SHIPPING)
  value: Decimal;               // Percentage or dollar amount

  // Conditions
  minOrderCents?: number;       // Minimum order total (cents)
  buyProductIds: string[];      // Products that qualify for "buy" (empty = all)

  // Buy X Get Y / Spend Get Free
  buyQuantity?: number;         // How many to buy
  getQuantity?: number;         // How many you get
  getProductIds: string[];      // Products to give (empty = cheapest in cart)

  // Validity
  startsAt: Date;
  endsAt?: Date;
  isActive: boolean;
  priority: number;             // Higher = applied first
  stackable: boolean;           // Can combine with others
}
```

## Shared Promotion Engine

Location: `packages/shared/src/services/promotionEngine.ts`

The promotion engine is a **pure function** with no database calls. It takes line items and promotions as input and returns the evaluation result.

### evaluatePromotions(lineItems, promotions, productCatalog?)

```typescript
import { evaluatePromotions, type EngineLineItem, type PromotionInput } from '@field-sales/shared';

const result = evaluatePromotions(lineItems, promotions, productCatalog);
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `lineItems` | `EngineLineItem[]` | Cart line items to evaluate |
| `promotions` | `PromotionInput[]` | Available promotions |
| `productCatalog` | `Map<string, ProductInfo>` | Optional: Product info for free items |

#### Return Value

```typescript
{
  appliedPromotions: EngineAppliedPromotion[];
  totalDiscountCents: number;
  freeItemsToAdd: FreeItemToAdd[];  // Items to add to cart as free
}
```

### Evaluation Logic

1. Calculates subtotal from non-free line items
2. Sorts promotions by priority (descending)
3. For each promotion:
   - Checks qualification based on type
   - If non-stackable promo already applied, skips other non-stackables
   - Calculates discount or determines free items
4. Returns applied promotions and any free items to add

### Type Definitions

```typescript
interface EngineLineItem {
  id: string;
  productId: string;       // Shopify product ID
  variantId: string;       // Shopify variant ID
  quantity: number;
  unitPriceCents: number;
  isFreeItem?: boolean;    // True if added by promotion
}

interface PromotionInput {
  id: string;
  name: string;
  type: PromotionType;
  value: number;           // % for PERCENTAGE, dollars for FIXED_AMOUNT
  minOrderCents?: number | null;
  buyQuantity?: number | null;
  buyProductIds?: string[];
  getQuantity?: number | null;
  getProductIds?: string[];
  stackable: boolean;
  priority: number;
}

interface FreeItemToAdd {
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  promotionId: string;
  promotionName: string;
}
```

## Field App Service

Location: `src/services/promotions.ts`

The field-app wraps the shared engine with database integration:

```typescript
import { evaluatePromotions, getActivePromotions } from '@/services/promotions';

// Get active promotions from database
const promotions = await getActivePromotions(shopId);

// Evaluate promotions against cart
const result = await evaluatePromotions(shopId, lineItems);
```

### formatDiscountsForDraftOrder(result)

Formats evaluation result for Shopify DraftOrder creation:

```typescript
const draftOrderLineItems = formatDiscountsForDraftOrder(result);
// Returns line items with appliedDiscount for Shopify API
```

## usePromotions Hook

Location: `src/hooks/usePromotions.ts`

Client-side hook for evaluating promotions with catalog-aware pricing for free items.

### Usage

```typescript
import { usePromotions } from '@/hooks/usePromotions';

// Pass locationId for catalog-aware pricing on free items
const { availablePromotions, loading, evaluateCart } = usePromotions({
  locationId: shippingLocation?.id,
});

// Evaluate cart - returns line items with free items included
const result = evaluateCart(lineItems);
// result: { lineItems, appliedPromotions, lineItemDiscountCents, orderDiscountCents, discountCents }
```

### How It Works

1. **Fetches promotions with product info**: Calls `/api/promotions?locationId=xxx`
2. **Builds productCatalog**: Creates `Map<variantId, ProductInfo>` from `freeItemProducts`
3. **Evaluates with catalog**: Passes productCatalog to shared engine for free item lookups
4. **Returns complete line items**: Including free items with correct title, price, and variant info

### Catalog-Aware Free Items

When a BUY_X_GET_Y or SPEND_GET_FREE promotion adds a free item:
- The product info (title, price, variantTitle) comes from the productCatalog
- If a locationId is provided, catalog pricing is applied (via `/api/promotions`)
- Falls back to default variant pricing if no catalog assigned

### Re-fetching

The hook re-fetches promotions when `locationId` changes, ensuring:
- Free item prices reflect the correct catalog
- Products unavailable in a catalog won't be added

## Promotions API

Location: `src/app/api/promotions/route.ts`

### GET /api/promotions

Returns active promotions with product info for free items.

**Query Parameters:**
- `locationId` (optional): Company location ID for catalog-aware pricing

**Response:**
```typescript
{
  data: {
    promotions: PromotionListItem[];
    freeItemProducts: ProductPriceInfo[];  // Product info for getProductIds
  }
}
```

The `freeItemProducts` array contains product info for all variants referenced in `getProductIds` across promotions, with prices from the location's catalog if applicable.

## Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/services/promotionEngine.ts` | Shared evaluation engine (pure function) |
| `src/services/promotions.ts` | Field app service with DB integration |
| `src/services/products.ts` | Product service with catalog-aware pricing |
| `src/hooks/usePromotions.ts` | Client-side promotion evaluation hook |
| `src/app/api/promotions/route.ts` | Promotions API with free item products |

## Promotion Storage

When orders are saved, promotions are stored for display:

### LINE_ITEM Promotions
- Stored as line items with `isFreeItem: true`, `promotionId`, and `promotionName`
- Free items appear as $0 line items in the Products section

### ORDER_TOTAL Promotions
- Stored in `order.appliedPromotionIds` array
- The `discountCents` field holds the total discount

### Display
- Promotions Applied section shows all promotions with "$X Savings" format
- LINE_ITEM promotions extracted from free line items
- ORDER_TOTAL promotions loaded from `appliedPromotionIds`

## Integration Points

Promotions are evaluated:
- When creating order from cart (`POST /api/orders`)
- When editing order line items (`PATCH /api/orders/[id]`)
- In OrderForm when cart contents change (auto-apply)
