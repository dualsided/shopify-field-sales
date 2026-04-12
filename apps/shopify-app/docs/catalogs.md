# Catalogs

B2B catalog pricing and product availability for company locations.

## Overview

Catalogs in Shopify B2B allow merchants to assign custom pricing to company locations. This app syncs catalog data from Shopify and applies catalog pricing when displaying products in the field app.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHOPIFY B2B                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Catalog (CompanyLocationCatalog)                                   │
│    └─► PriceList                                                    │
│          └─► Prices (per variant)                                   │
│                                                                     │
│  CompanyLocation ◄───► Catalog (many-to-many)                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Sync via GraphQL
┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Catalog                                                            │
│    └─► CatalogItem (variant pricing)                                │
│                                                                     │
│  CompanyLocation ◄───► Catalog (via CompanyLocationCatalog)         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Product queries
┌─────────────────────────────────────────────────────────────────────┐
│                         FIELD APP                                    │
├─────────────────────────────────────────────────────────────────────┤
│  Products API with companyLocationId                                │
│    └─► Returns variants with catalog pricing overlay                │
│          ├─► priceCents (catalog price or base price)               │
│          ├─► basePriceCents (original variant price)                │
│          └─► hasCatalogPrice (boolean indicator)                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model

### Catalog
```typescript
{
  id: string;
  shopId: string;
  shopifyCatalogId: string;     // Numeric ID from Shopify
  shopifyPriceListId?: string;  // Associated price list
  title: string;
  status: CatalogStatus;        // ACTIVE, DRAFT, ARCHIVED
  currencyCode: string;         // e.g., "USD"
  syncedAt: Date;
}
```

### CompanyLocationCatalog
Join table linking locations to catalogs (many-to-many).

```typescript
{
  companyLocationId: string;
  catalogId: string;
}
```

### CatalogItem
Pricing override for a specific variant within a catalog.

```typescript
{
  id: string;
  catalogId: string;
  shopifyVariantId: string;     // Numeric ID
  shopifyProductId: string;     // For quick lookups
  priceCents: number;           // Catalog price
  compareAtPriceCents?: number; // Compare at price (strikethrough)
}
```

## Sync Flow

### When Catalogs Sync

Catalogs sync automatically via company location webhooks:

1. **Company Create/Update Webhook** triggers `syncCompanyDetails()`
2. For each company location, `syncCompanyLocationCatalogs()` is called
3. Catalogs assigned to the location are fetched from Shopify
4. Each catalog's price list items are synced to `CatalogItem` table

```
Company Webhook ──► syncCompanyDetails()
                         │
                         ▼
                    For each location:
                         │
                         ▼
                    syncCompanyLocationCatalogs()
                         │
                         ├─► Fetch catalogs from Shopify
                         ├─► Upsert Catalog records
                         ├─► Sync PriceList prices to CatalogItems
                         └─► Update CompanyLocationCatalog assignments
```

### Initial Onboarding

During shop onboarding, after products and companies are synced:
1. All B2B catalogs are synced via `syncAllShopCatalogs()`
2. Location-catalog assignments are created

### Manual Resync

Catalogs can be manually resynced from the admin UI or via API if needed.

## Product Pricing Overlay

When fetching products with a `companyLocationId`, catalog pricing is applied:

### Shopify App (product.server.ts)

```typescript
import { getCatalogPricingForLocation, getAvailableVariantsForLocation } from "./catalog.server";

export async function getEnabledProducts(
  shopId: string,
  options?: { companyLocationId?: string }
): Promise<ProductVariantResult[]> {
  // Get base products
  const products = await prisma.product.findMany({ ... });

  // Get catalog pricing if location specified
  let catalogPricing: Map<string, { priceCents: number }> | null = null;
  let availableVariants: Set<string> | null = null;

  if (options?.companyLocationId) {
    [catalogPricing, availableVariants] = await Promise.all([
      getCatalogPricingForLocation(options.companyLocationId),
      getAvailableVariantsForLocation(options.companyLocationId),
    ]);
  }

  // Apply catalog overlay to each variant
  return products.flatMap(product =>
    product.variants
      .filter(v => !availableVariants || availableVariants.has(v.shopifyVariantId))
      .map(variant => ({
        ...variant,
        basePriceCents: variant.priceCents,
        priceCents: catalogPricing?.get(variant.shopifyVariantId)?.priceCents ?? variant.priceCents,
        hasCatalogPrice: catalogPricing?.has(variant.shopifyVariantId) ?? false,
      }))
  );
}
```

### Field App (API)

```typescript
// GET /api/products?companyLocationId=xxx

const response = {
  items: [{
    id: "...",
    title: "Product Name",
    variants: [{
      id: "...",
      shopifyVariantId: "12345",
      priceCents: 8500,         // Catalog price (or base if no catalog)
      basePriceCents: 10000,    // Original variant price
      hasCatalogPrice: true,    // Has catalog pricing applied
      available: true,
    }]
  }],
  pagination: { ... }
};
```

## Key Functions

### catalog.server.ts

| Function | Description |
|----------|-------------|
| `syncCompanyLocationCatalogs(...)` | Sync all catalogs for a company location |
| `syncCatalog(...)` | Sync single catalog and its price list items |
| `syncAllShopCatalogs(...)` | Sync all B2B catalogs for a shop |
| `getCatalogPricingForLocation(locationId)` | Get pricing map for a location |
| `getAvailableVariantsForLocation(locationId)` | Get set of available variant IDs |
| `deleteCatalog(...)` | Delete catalog and its items |

### Catalog Pricing Functions

```typescript
// Get catalog pricing map (variantId -> { priceCents, compareAtPriceCents })
const pricing = await getCatalogPricingForLocation(companyLocationId);
const variantPrice = pricing.get("12345"); // { priceCents: 8500, compareAtPriceCents: 10000 }

// Get available variants (only variants in active catalogs)
const available = await getAvailableVariantsForLocation(companyLocationId);
const isAvailable = available.has("12345"); // true/false
```

## GraphQL Queries

### Fetch Location Catalogs

```graphql
query CompanyLocationCatalogs($id: ID!) {
  companyLocation(id: $id) {
    id
    catalogs(first: 10) {
      nodes {
        id
        title
        status
        priceList {
          id
          name
          currency
        }
      }
    }
  }
}
```

### Fetch Price List Prices

```graphql
query PriceListPrices($id: ID!, $first: Int!, $after: String) {
  priceList(id: $id) {
    prices(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        variant {
          id
          product { id }
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
        }
      }
    }
  }
}
```

## Catalog Status

| Status | Description |
|--------|-------------|
| `ACTIVE` | Catalog is active and pricing is applied |
| `DRAFT` | Catalog is not published (pricing not applied) |
| `ARCHIVED` | Catalog is archived (pricing not applied) |

Only `ACTIVE` catalogs are used for pricing lookups.

## Catalog Availability Filtering

When a company location has catalogs assigned:

1. **With catalog items**: Only variants in the catalog are shown
2. **Empty catalog**: All products are shown (no filtering)
3. **No catalog assigned**: All products are shown at base prices

This allows merchants to control which products each customer can purchase.

## Limitations

### No Direct Catalog Webhooks

Shopify does not provide webhooks for catalog changes. Catalogs sync when:
- Company/location webhooks fire (CREATE, UPDATE)
- Manual resync is triggered
- Shop onboarding completes

### Price List Size

Large price lists are paginated (250 items per page). The sync process handles pagination automatically.

## Related Documentation

- [Companies](./companies.md) - Company location management
- [Orders](./orders.md) - How catalog pricing flows to orders
