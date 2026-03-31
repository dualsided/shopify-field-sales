# Products

Product catalog in the Field Sales app.

## Overview

Products are synced from Shopify by the shopify-app. Only products with `enabledForFieldApp: true` appear in the field app catalog.

## Data Model

### Product
```typescript
{
  id: string;
  shopId: string;
  shopifyProductId: string;     // Shopify GID
  title: string;
  description?: string;
  imageUrl?: string;
  productType?: string;
  vendor?: string;
  tags: string[];
  status: ProductStatus;        // ACTIVE, ARCHIVED, DRAFT
  isActive: boolean;
  enabledForFieldApp: boolean;
  variants: ProductVariant[];
}
```

### ProductVariant
```typescript
{
  id: string;
  productId: string;
  shopifyVariantId: string;     // Shopify GID
  title: string;                // e.g., "Large / Blue"
  sku?: string;
  priceCents: number;
  comparePriceCents?: number;
  imageUrl?: string;
  inventoryQuantity?: number;
  isAvailable: boolean;
  position: number;
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/products` | GET | List products (paginated, searchable) |

### Query Parameters
- `query` - Search by title or SKU
- `page` - Page number (default: 1)
- `pageSize` - Items per page (default: 20, max: 50)

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/products/route.ts` | List products |

## Product Enablement

Products appear in field app when:
1. `enabledForFieldApp: true`
2. `isActive: true`
3. `status: ACTIVE`

Enablement can be:
- Manual: Set in shopify-app admin
- Automatic: Via product inclusion tag matching (configured per shop)
