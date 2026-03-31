# Orders

Order management in the Field Sales app.

## Order Status Flow

```
DRAFT → AWAITING_REVIEW → PENDING → PAID/CANCELLED/REFUNDED
  ↑           ↑              ↑
Sales rep   Admin in      Shopify
edits       shopify-app   statuses
            approves
```

### Status Definitions

| Status | Description | Editable |
|--------|-------------|----------|
| `DRAFT` | Sales rep is building/editing the order | Yes |
| `AWAITING_REVIEW` | Submitted for admin approval in shopify-app | No |
| `PENDING` | Approved and synced to Shopify as draft order | No |
| `PAID` | Payment received | No |
| `CANCELLED` | Order cancelled | No |
| `REFUNDED` | Order refunded | No |

## Order Creation

### Flow
1. Rep navigates to account → "New Order"
2. Browses product catalog, selects variants
3. Items added to cart (CartSession)
4. Rep submits cart → Order created with status `DRAFT`
5. Rep can continue editing on order detail page
6. Rep clicks "Submit for Review" → status changes to `AWAITING_REVIEW`
7. Admin in shopify-app reviews and approves
8. Order synced to Shopify, status becomes `PENDING`

### Creating from Cart
```
POST /api/orders
Body: { companyId: string }
```
- Converts active CartSession to Order
- Evaluates promotions and applies discounts
- Generates internal order number (FS-000001)
- Sets status to `DRAFT`

## Order Editing

Only orders with `status === 'DRAFT'` can be edited.

### Available Actions

#### Add Item
```
PATCH /api/orders/[id]
Body: {
  action: 'add_item',
  item: {
    variantId: string,      // Shopify variant GID
    productId: string,      // Shopify product GID
    title: string,
    variantTitle?: string,
    sku?: string,
    quantity: number,
    unitPriceCents: number,
    imageUrl?: string
  }
}
```
- If variant already exists in order, quantity is incremented (no duplicates)
- Promotions recalculated after add

#### Update Item Quantity
```
PATCH /api/orders/[id]
Body: {
  action: 'update_item',
  item: {
    lineItemId: string,
    quantity: number        // Set to 0 to remove
  }
}
```
- If quantity ≤ 0, item is removed
- Promotions recalculated after update

#### Remove Item
```
PATCH /api/orders/[id]
Body: {
  action: 'remove_item',
  item: { lineItemId: string }
}
```

#### Submit for Review
```
PATCH /api/orders/[id]
Body: { action: 'submit_for_review' }
```
- Validates order has at least one line item
- Changes status to `AWAITING_REVIEW`
- Sets `placedAt` timestamp

## API Endpoints

### List Orders
```
GET /api/orders?page=1&pageSize=20&companyId=xxx
```
Returns paginated list of orders for the authenticated rep.

### Get Order Detail
```
GET /api/orders/[id]
```
Returns full order with line items, company info, totals.

### Create Order
```
POST /api/orders
Body: { companyId: string }
```
Creates order from active cart session.

### Edit Order
```
PATCH /api/orders/[id]
Body: { action: string, item?: object }
```
See "Order Editing" section above.

## Data Models

### Order
```typescript
{
  id: string;
  shopId: string;
  companyId: string;
  salesRepId: string;
  orderNumber: string;           // Internal: FS-000001
  shopifyDraftOrderId?: string;  // After sync to Shopify
  shopifyOrderId?: string;       // After completion
  shopifyOrderNumber?: string;   // Shopify's #1001
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  paymentTerms: PaymentTerms;
  placedAt?: Date;
  lineItems: OrderLineItem[];
}
```

### OrderLineItem
```typescript
{
  id: string;
  orderId: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  sku?: string;
  title: string;
  variantTitle?: string;
  imageUrl?: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}
```

## UI Components

### Order List (`/orders`)
- Filterable by status (all, pending, paid, fulfilled)
- Shows order number, company, total, status badge, date
- Click to navigate to detail

### Order Detail (`/orders/[id]`)
- Header with order number and date
- Status badge (color-coded)
- Line items list
  - Edit mode (DRAFT): quantity +/- buttons, delete button
  - Read mode: shows line total
- "Add Products" button (DRAFT only)
- Summary section (subtotal, discount, shipping, tax, total)
- Order info (company, rep, territory)
- Fixed bottom action bar with "Submit for Review" (DRAFT only)

### Product Picker Modal
- Full-screen modal triggered by "Add Products"
- Search input for filtering
- 2-column product grid
- Quantity badge on products already in order
- Click product → variant selection modal

### Variant Selection Modal
- Bottom sheet modal
- Shows product image and title
- Lists all variants with price and availability
- Disabled state for out-of-stock variants
- Click variant to add to order

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(app)/orders/page.tsx` | Orders list page |
| `src/app/(app)/orders/[id]/page.tsx` | Order detail & editing |
| `src/app/(app)/accounts/[id]/order/page.tsx` | New order creation |
| `src/app/api/orders/route.ts` | GET (list) and POST (create) |
| `src/app/api/orders/[id]/route.ts` | GET (detail) and PATCH (edit) |
| `src/services/promotion-engine.ts` | Discount calculation |

## Promotion Integration

When line items change, the promotion engine recalculates discounts:

1. Fetches active promotions for the shop
2. Checks conditions (min quantity, min order total, product eligibility)
3. Applies discounts by type:
   - `PERCENTAGE` - X% off applicable items
   - `FIXED_AMOUNT` - $X off per item
   - `BUY_X_GET_Y` - Buy X get Y at discount
4. Updates line item `discountCents` and `totalCents`
5. Updates order totals

See [Promotions](./promotions.md) for detailed promotion logic.
