# Products

Product catalog in the Field Sales app.

## Overview

Products are synced from Shopify by the shopify-app. Only products with `enabledForFieldApp: true` appear in the field app catalog.

When a company location is selected, catalog pricing is applied if the location has B2B catalogs assigned in Shopify.

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
- `companyLocationId` - Apply catalog pricing for this location
- `page` - Page number (default: 1)
- `pageSize` - Items per page (default: 20, max: 50)

### Response with Catalog Pricing

When `companyLocationId` is provided, each variant includes:

```typescript
{
  id: string;
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  priceCents: number;           // Catalog price (or base if no catalog)
  basePriceCents: number;       // Original variant price
  hasCatalogPrice: boolean;     // true if catalog pricing applied
  available: boolean;
  inventoryQuantity: number | null;
}
```

## Catalog Pricing

B2B catalogs allow merchants to set custom pricing per company location. When products are fetched with a `companyLocationId`:

1. **Catalog pricing overlay**: If the location has an active catalog, variant prices are replaced with catalog prices
2. **Availability filtering**: Only variants in the catalog are returned (if catalog has items)
3. **Base price preserved**: `basePriceCents` always contains the original variant price for reference

### Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  GET /api/products?companyLocationId=xxx                            │
├─────────────────────────────────────────────────────────────────────┤
│  1. Fetch enabled products                                          │
│  2. If companyLocationId provided:                                  │
│     a. Get catalog pricing for location                             │
│     b. Get available variants for location                          │
│     c. Filter variants by catalog availability                      │
│     d. Apply catalog prices to matching variants                    │
│  3. Return products with pricing overlay                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Example Response

```json
{
  "data": {
    "items": [
      {
        "id": "prod_123",
        "title": "Widget Pro",
        "variants": [
          {
            "id": "var_456",
            "shopifyVariantId": "12345",
            "title": "Large",
            "sku": "WGT-PRO-LG",
            "priceCents": 8500,
            "basePriceCents": 10000,
            "hasCatalogPrice": true,
            "available": true
          }
        ]
      }
    ],
    "pagination": { ... }
  }
}
```

## Product Service

Location: `src/services/products.ts`

The product service provides catalog-aware pricing for product lookups.

### getProductPrices(shopId, variantIds, locationId?)

Fetches product info with pricing from the catalog assigned to a location:

```typescript
import { getProductPrices, type ProductPriceInfo } from '@/services/products';

// Get prices for specific variants, with optional catalog pricing
const products = await getProductPrices(shopId, variantIds, locationId);
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `shopId` | `string` | Shop ID for multi-tenancy |
| `variantIds` | `string[]` | Shopify variant IDs to fetch |
| `locationId` | `string?` | Optional location ID for catalog pricing |

#### Return Value

```typescript
interface ProductPriceInfo {
  variantId: string;      // Shopify variant ID
  productId: string;      // Shopify product ID
  title: string;          // Product title
  variantTitle: string | null;
  priceCents: number;     // Catalog price (or default if no catalog)
  sku: string | null;
}
```

#### Pricing Logic

1. **Default pricing**: Uses `ProductVariant.priceCents` from the database
2. **Catalog override**: If `locationId` is provided:
   - Looks up `CompanyLocationCatalog` for the location
   - Finds `CatalogItem` entries matching the variant IDs
   - Overrides prices with catalog pricing (first active catalog wins)

#### Usage in Promotions

This service is used by `/api/promotions` to provide catalog-aware pricing for free items:

```typescript
// In /api/promotions/route.ts
const freeItemProducts = await getProductPrices(
  shopId,
  allFreeItemVariantIds,
  locationId  // From query parameter
);
```

This ensures BUY_X_GET_Y and SPEND_GET_FREE promotions display free items with the correct catalog price.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/products/route.ts` | List products with catalog pricing |
| `src/services/products.ts` | Product service with catalog-aware pricing |

## Product Enablement

Products appear in field app when:
1. `enabledForFieldApp: true`
2. `isActive: true`
3. `status: ACTIVE`

Enablement can be:
- Manual: Set in shopify-app admin
- Automatic: Via product inclusion tag matching (configured per shop)

## Related Documentation

- [Promotions](./promotions.md) - Uses product service for free item pricing
- [Orders](./orders.md) - OrderForm passes locationId to usePromotions for catalog-aware pricing
- shopify-app [Catalogs](../../shopify-app/docs/catalogs.md) - How catalogs are synced from Shopify
