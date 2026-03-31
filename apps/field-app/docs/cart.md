# Cart

Shopping cart functionality in the Field Sales app.

## Overview

Carts are temporary shopping sessions stored in the database. Each cart is tied to a sales rep and company, with a 24-hour expiration.

## Data Model

### CartSession
```typescript
{
  id: string;
  shopId: string;
  repId: string;
  companyId: string;
  lineItems: CartLineItem[];    // Stored as JSON
  discountCodes: string[];
  notes?: string;
  status: CartStatus;           // ACTIVE, SUBMITTED, ABANDONED
  expiresAt: Date;              // 24 hours from creation/update
}
```

### CartLineItem
```typescript
{
  variantId: string;            // Shopify variant GID
  productId: string;            // Shopify product GID
  title: string;
  variantTitle?: string;
  sku?: string;
  quantity: number;
  price: string;                // Decimal as string
  imageUrl?: string;
}
```

## API Endpoints

### Get Cart
```
GET /api/cart?companyId=xxx
```
Returns active cart for company, or creates empty one if none exists.

### Modify Cart
```
PUT /api/cart
Body: {
  companyId: string,
  action: 'add' | 'update' | 'remove' | 'clear',
  item?: CartLineItem
}
```

#### Actions
- `add` - Add item (increments qty if exists)
- `update` - Set item quantity (removes if qty ≤ 0)
- `remove` - Remove item by variantId
- `clear` - Empty all items

### Delete Cart
```
DELETE /api/cart?companyId=xxx
```
Marks cart as ABANDONED.

## Cart Lifecycle

```
Create (GET) → Add items → Submit (POST /api/orders) → SUBMITTED
                  ↓
              24h expires → ABANDONED
```

1. Cart auto-created when rep views order page for a company
2. Items added/modified via PUT requests
3. Expiration extended on each modification
4. On order submit, cart marked as SUBMITTED
5. Abandoned carts expire after 24 hours of inactivity

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(app)/accounts/[id]/order/page.tsx` | Cart UI (order creation) |
| `src/app/api/cart/route.ts` | Cart API (GET, PUT, DELETE) |

## UI Components

### Order Page (`/accounts/[id]/order`)
- Product search and grid
- Variant selection modal
- Cart summary bar (fixed bottom)
- Expandable cart view with qty controls
- "Place Order" button to submit
