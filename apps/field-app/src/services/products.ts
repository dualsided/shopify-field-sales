import { prisma } from '@/lib/db/prisma';

export interface ProductPriceInfo {
  variantId: string;
  productId: string;
  title: string;
  variantTitle: string | null;
  priceCents: number;
  sku: string | null;
}

/**
 * Get product prices for specific variants, using catalog pricing if available.
 *
 * Pricing priority:
 * 1. If locationId provided and location has a catalog, use CatalogItem prices
 * 2. Otherwise, fall back to ProductVariant default prices
 */
export async function getProductPrices(
  shopId: string,
  variantIds: string[],
  locationId?: string | null
): Promise<ProductPriceInfo[]> {
  if (variantIds.length === 0) {
    return [];
  }

  // First, get the product/variant info (always needed)
  const variants = await prisma.productVariant.findMany({
    where: {
      shopifyVariantId: { in: variantIds },
      product: { shopId },
    },
    include: {
      product: { select: { shopifyProductId: true, title: true } },
    },
  });

  // Build a map of variant info with default prices
  const variantMap = new Map<string, ProductPriceInfo>();
  for (const variant of variants) {
    variantMap.set(variant.shopifyVariantId, {
      variantId: variant.shopifyVariantId,
      productId: variant.product.shopifyProductId,
      title: variant.product.title,
      variantTitle: variant.title !== 'Default Title' ? variant.title : null,
      priceCents: variant.priceCents,
      sku: variant.sku,
    });
  }

  // If location provided, check for catalog pricing
  if (locationId) {
    // Find catalog(s) assigned to this location
    const locationCatalogs = await prisma.companyLocationCatalog.findMany({
      where: { companyLocationId: locationId },
      include: {
        catalog: {
          include: {
            items: {
              where: { shopifyVariantId: { in: variantIds } },
            },
          },
        },
      },
    });

    // Apply catalog prices (first matching catalog wins)
    for (const locationCatalog of locationCatalogs) {
      if (locationCatalog.catalog.status === 'ACTIVE') {
        for (const item of locationCatalog.catalog.items) {
          const existing = variantMap.get(item.shopifyVariantId);
          if (existing) {
            // Override with catalog price
            variantMap.set(item.shopifyVariantId, {
              ...existing,
              priceCents: item.priceCents,
            });
          }
        }
        break; // Use first active catalog only
      }
    }
  }

  return Array.from(variantMap.values());
}

/**
 * Get a single product's price info with catalog awareness
 */
export async function getProductPrice(
  shopId: string,
  variantId: string,
  locationId?: string | null
): Promise<ProductPriceInfo | null> {
  const results = await getProductPrices(shopId, [variantId], locationId);
  return results[0] || null;
}
