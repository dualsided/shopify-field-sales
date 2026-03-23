import { prisma } from '@/lib/db/prisma';
import { shopifyGraphQL } from '@/lib/shopify/client';
import type { ProductStatus } from '.prisma/field-app-client';

// GraphQL query to fetch products with variants
const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          description
          status
          productType
          vendor
          tags
          featuredImage {
            url
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                availableForSale
                position
                image {
                  url
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `#graphql
  query Product($id: ID!) {
    product(id: $id) {
      id
      title
      description
      status
      productType
      vendor
      tags
      featuredImage {
        url
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
            availableForSale
            position
            image {
              url
            }
          }
        }
      }
    }
  }
`;

// Types for Shopify response
interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  position: number;
  image: { url: string } | null;
}

interface ShopifyProduct {
  id: string;
  title: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  productType: string | null;
  vendor: string | null;
  tags: string[];
  featuredImage: { url: string } | null;
  variants: {
    edges: Array<{ node: ShopifyVariant }>;
  };
}

interface ProductsResponse {
  products: {
    edges: Array<{ cursor: string; node: ShopifyProduct }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

interface ProductByIdResponse {
  product: ShopifyProduct | null;
}

/**
 * Convert Shopify price string (dollars) to cents
 */
function priceToCents(price: string | null): number {
  if (!price) return 0;
  return Math.round(parseFloat(price) * 100);
}

/**
 * Map Shopify status to our ProductStatus enum
 */
function mapStatus(status: ShopifyProduct['status']): ProductStatus {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'ARCHIVED':
      return 'ARCHIVED';
    case 'DRAFT':
      return 'DRAFT';
    default:
      return 'DRAFT';
  }
}

/**
 * Check if product has the inclusion tag (case-insensitive)
 */
function hasInclusionTag(productTags: string[], inclusionTag: string | null): boolean {
  if (!inclusionTag) return false;
  const lowerTag = inclusionTag.toLowerCase();
  return productTags.some((t) => t.toLowerCase() === lowerTag);
}

/**
 * Upsert a single product and its variants into the database
 * @param inclusionTag - If set, products with this tag are auto-enabled for field app
 */
async function upsertProduct(
  shopId: string,
  product: ShopifyProduct,
  inclusionTag: string | null = null
): Promise<void> {
  const now = new Date();
  const tags = product.tags || [];
  const shouldAutoEnable = hasInclusionTag(tags, inclusionTag);

  // Check if product already exists to preserve manual enablement
  const existingProduct = await prisma.product.findUnique({
    where: {
      shopId_shopifyProductId: {
        shopId,
        shopifyProductId: product.id,
      },
    },
    select: { enabledForFieldApp: true },
  });

  // Auto-enable if tag matches, but never auto-disable (preserve manual enablement)
  const enabledForFieldApp = shouldAutoEnable || (existingProduct?.enabledForFieldApp ?? false);

  // Upsert the product
  const dbProduct = await prisma.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId,
        shopifyProductId: product.id,
      },
    },
    create: {
      shopId,
      shopifyProductId: product.id,
      title: product.title,
      description: product.description,
      imageUrl: product.featuredImage?.url ?? null,
      productType: product.productType,
      vendor: product.vendor,
      tags,
      status: mapStatus(product.status),
      isActive: product.status === 'ACTIVE',
      enabledForFieldApp,
      syncedAt: now,
    },
    update: {
      title: product.title,
      description: product.description,
      imageUrl: product.featuredImage?.url ?? null,
      productType: product.productType,
      vendor: product.vendor,
      tags,
      status: mapStatus(product.status),
      isActive: product.status === 'ACTIVE',
      enabledForFieldApp,
      syncedAt: now,
    },
  });

  // Get existing variant IDs to detect deleted variants
  const existingVariants = await prisma.productVariant.findMany({
    where: { productId: dbProduct.id },
    select: { shopifyVariantId: true },
  });
  const existingVariantIds = new Set(existingVariants.map((v) => v.shopifyVariantId));

  // Upsert variants
  const incomingVariantIds = new Set<string>();

  for (const edge of product.variants.edges) {
    const variant = edge.node;
    incomingVariantIds.add(variant.id);

    await prisma.productVariant.upsert({
      where: {
        productId_shopifyVariantId: {
          productId: dbProduct.id,
          shopifyVariantId: variant.id,
        },
      },
      create: {
        productId: dbProduct.id,
        shopifyVariantId: variant.id,
        title: variant.title,
        sku: variant.sku,
        priceCents: priceToCents(variant.price),
        comparePriceCents: priceToCents(variant.compareAtPrice),
        imageUrl: variant.image?.url ?? null,
        inventoryQuantity: variant.inventoryQuantity,
        isAvailable: variant.availableForSale,
        position: variant.position,
      },
      update: {
        title: variant.title,
        sku: variant.sku,
        priceCents: priceToCents(variant.price),
        comparePriceCents: priceToCents(variant.compareAtPrice),
        imageUrl: variant.image?.url ?? null,
        inventoryQuantity: variant.inventoryQuantity,
        isAvailable: variant.availableForSale,
        position: variant.position,
      },
    });
  }

  // Delete variants that no longer exist in Shopify
  const variantsToDelete = [...existingVariantIds].filter((id) => !incomingVariantIds.has(id));
  if (variantsToDelete.length > 0) {
    await prisma.productVariant.deleteMany({
      where: {
        productId: dbProduct.id,
        shopifyVariantId: { in: variantsToDelete },
      },
    });
  }
}

/**
 * Sync all products for a shop from Shopify
 * This is used for initial sync or full refresh
 */
export async function syncAllProducts(shopId: string): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;
  let hasNextPage: boolean = true;
  let cursor: string | null = null;

  console.log(`Starting full product sync for shop ${shopId}`);

  // Get shop's inclusion tag setting
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { productInclusionTag: true },
  });
  const inclusionTag = shop?.productInclusionTag ?? null;

  if (inclusionTag) {
    console.log(`Auto-enabling products with tag: "${inclusionTag}"`);
  }

  while (hasNextPage) {
    try {
      const response: ProductsResponse = await shopifyGraphQL<ProductsResponse>(shopId, PRODUCTS_QUERY, {
        first: 50,
        after: cursor,
      });

      for (const edge of response.products.edges) {
        try {
          await upsertProduct(shopId, edge.node, inclusionTag);
          synced++;
        } catch (error) {
          console.error(`Failed to sync product ${edge.node.id}:`, error);
          errors++;
        }
      }

      hasNextPage = response.products.pageInfo.hasNextPage;
      cursor = response.products.pageInfo.endCursor;

      console.log(`Synced ${synced} products so far...`);
    } catch (error) {
      console.error('Error fetching products from Shopify:', error);
      break;
    }
  }

  console.log(`Product sync complete. Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

/**
 * Sync a single product by Shopify GID
 * Used for webhook handlers
 */
export async function syncProductById(shopId: string, shopifyProductId: string): Promise<boolean> {
  try {
    // Get shop's inclusion tag setting
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { productInclusionTag: true },
    });
    const inclusionTag = shop?.productInclusionTag ?? null;

    const response = await shopifyGraphQL<ProductByIdResponse>(shopId, PRODUCT_BY_ID_QUERY, {
      id: shopifyProductId,
    });

    if (!response.product) {
      console.log(`Product ${shopifyProductId} not found in Shopify, may have been deleted`);
      return false;
    }

    await upsertProduct(shopId, response.product, inclusionTag);
    console.log(`Synced product ${shopifyProductId}`);
    return true;
  } catch (error) {
    console.error(`Failed to sync product ${shopifyProductId}:`, error);
    return false;
  }
}

/**
 * Delete a product and its variants from the database
 * Used for product delete webhooks
 */
export async function deleteProduct(shopId: string, shopifyProductId: string): Promise<boolean> {
  try {
    const product = await prisma.product.findUnique({
      where: {
        shopId_shopifyProductId: {
          shopId,
          shopifyProductId,
        },
      },
    });

    if (!product) {
      console.log(`Product ${shopifyProductId} not found in database`);
      return true;
    }

    // Delete variants first (cascade should handle this, but being explicit)
    await prisma.productVariant.deleteMany({
      where: { productId: product.id },
    });

    // Delete product
    await prisma.product.delete({
      where: { id: product.id },
    });

    console.log(`Deleted product ${shopifyProductId}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete product ${shopifyProductId}:`, error);
    return false;
  }
}

/**
 * Mark a product as inactive (soft delete)
 * Alternative to hard delete for archiving products
 */
export async function archiveProduct(shopId: string, shopifyProductId: string): Promise<boolean> {
  try {
    await prisma.product.updateMany({
      where: {
        shopId,
        shopifyProductId,
      },
      data: {
        isActive: false,
        status: 'ARCHIVED',
      },
    });

    console.log(`Archived product ${shopifyProductId}`);
    return true;
  } catch (error) {
    console.error(`Failed to archive product ${shopifyProductId}:`, error);
    return false;
  }
}
