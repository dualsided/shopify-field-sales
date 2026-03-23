import prisma from "../db.server";
import { alignLocationToTerritory } from "./company.server";
import type { ProductStatus } from "@prisma/client";

// Shopify Company webhook payload types
interface ShopifyCompanyPayload {
  id: number;
  name: string;
  note?: string;
  external_id?: string;
  main_contact_admin_graphql_api_id?: string;
  created_at: string;
  updated_at: string;
}

interface ShopifyCompanyLocationPayload {
  id: number;
  company_id: number;
  name: string;
  external_id?: string;
  phone?: string;
  locale?: string;
  created_at: string;
  updated_at: string;
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  tax_exemptions?: string[];
  tax_registration_id?: string;
}

interface ShopifyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  phone?: string;
}

/**
 * Process company webhook events (create, update, delete)
 */
export async function processCompanyWebhook(
  shopDomain: string,
  topic: string,
  rawPayload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const payload = rawPayload as unknown as ShopifyCompanyPayload;
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });

    if (!shop) {
      console.log(`[Webhook] Shop not found for ${shopDomain}`);
      return { success: false, error: "Shop not found" };
    }

    // Store numeric ID only (not full GID)
    const shopifyCompanyId = String(payload.id);

    if (topic === "COMPANIES_DELETE") {
      // Soft delete - mark as inactive
      await prisma.company.updateMany({
        where: {
          shopId: shop.id,
          shopifyCompanyId,
        },
        data: {
          isActive: false,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
        },
      });
      console.log(`[Webhook] Company ${shopifyCompanyId} marked inactive`);
      return { success: true };
    }

    // Create or update company
    await prisma.company.upsert({
      where: {
        shopId_shopifyCompanyId: {
          shopId: shop.id,
          shopifyCompanyId,
        },
      },
      create: {
        shopId: shop.id,
        shopifyCompanyId,
        name: payload.name,
        accountNumber: payload.external_id || null,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date(),
        isActive: true,
      },
      update: {
        name: payload.name,
        accountNumber: payload.external_id || undefined,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date(),
        isActive: true,
      },
    });

    console.log(`[Webhook] Company ${shopifyCompanyId} upserted: ${payload.name}`);
    return { success: true };
  } catch (error) {
    console.error(`[Webhook] Error processing company:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process company location webhook events (create, update, delete)
 */
export async function processCompanyLocationWebhook(
  shopDomain: string,
  topic: string,
  rawPayload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const payload = rawPayload as unknown as ShopifyCompanyLocationPayload;
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });

    if (!shop) {
      console.log(`[Webhook] Shop not found for ${shopDomain}`);
      return { success: false, error: "Shop not found" };
    }

    // Store numeric IDs only (not full GIDs)
    const shopifyCompanyId = String(payload.company_id);
    const shopifyLocationId = String(payload.id);

    // Find the company
    const company = await prisma.company.findUnique({
      where: {
        shopId_shopifyCompanyId: {
          shopId: shop.id,
          shopifyCompanyId,
        },
      },
    });

    if (!company) {
      console.log(`[Webhook] Company ${shopifyCompanyId} not found for location`);
      return { success: false, error: "Company not found" };
    }

    if (topic === "COMPANY_LOCATIONS_DELETE") {
      // Delete the location
      await prisma.companyLocation.deleteMany({
        where: {
          companyId: company.id,
          shopifyLocationId,
        },
      });
      console.log(`[Webhook] Location ${shopifyLocationId} deleted`);
      return { success: true };
    }

    // Use shipping address as primary, fallback to billing
    const address = payload.shipping_address || payload.billing_address;

    // Create or update location
    const location = await prisma.companyLocation.upsert({
      where: {
        companyId_shopifyLocationId: {
          companyId: company.id,
          shopifyLocationId,
        },
      },
      create: {
        companyId: company.id,
        shopifyLocationId,
        name: payload.name,
        address1: address?.address1 || null,
        address2: address?.address2 || null,
        city: address?.city || null,
        province: address?.province || null,
        provinceCode: address?.province_code || null,
        zipcode: address?.zip || null,
        country: address?.country || "US",
        countryCode: address?.country_code || "US",
        phone: payload.phone || address?.phone || null,
        isShippingAddress: !!payload.shipping_address,
        isBillingAddress: !!payload.billing_address,
        isPrimary: false,
      },
      update: {
        name: payload.name,
        address1: address?.address1 || null,
        address2: address?.address2 || null,
        city: address?.city || null,
        province: address?.province || null,
        provinceCode: address?.province_code || null,
        zipcode: address?.zip || null,
        country: address?.country || "US",
        countryCode: address?.country_code || "US",
        phone: payload.phone || address?.phone || null,
        isShippingAddress: !!payload.shipping_address,
        isBillingAddress: !!payload.billing_address,
      },
    });

    console.log(`[Webhook] Location ${shopifyLocationId} upserted: ${payload.name}`);

    // Align location to territory based on address
    await alignLocationToTerritory(shop.id, location.id);

    return { success: true };
  } catch (error) {
    console.error(`[Webhook] Error processing company location:`, error);
    return { success: false, error: String(error) };
  }
}

// Shopify Product webhook payload types
interface ShopifyProductPayload {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  status: "active" | "archived" | "draft";
  tags: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
  variants?: Array<{
    id: number;
    title: string;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number | null;
    position: number;
    image_id?: number | null;
  }>;
}

function mapProductStatus(status: string): ProductStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "archived":
      return "ARCHIVED";
    case "draft":
      return "DRAFT";
    default:
      return "DRAFT";
  }
}

function priceToCents(price: string | null): number {
  if (!price) return 0;
  return Math.round(parseFloat(price) * 100);
}

function hasInclusionTag(productTags: string[], inclusionTag: string | null): boolean {
  if (!inclusionTag) return false;
  const lowerTag = inclusionTag.toLowerCase();
  return productTags.some((t) => t.toLowerCase() === lowerTag);
}

/**
 * Process product webhook events (create, update, delete)
 */
export async function processProductWebhook(
  shopDomain: string,
  topic: string,
  rawPayload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const payload = rawPayload as unknown as ShopifyProductPayload;
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });

    if (!shop) {
      console.log(`[Webhook] Shop not found for ${shopDomain}`);
      return { success: false, error: "Shop not found" };
    }

    // Store numeric ID only (not full GID)
    const shopifyProductId = String(payload.id);

    if (topic === "PRODUCTS_DELETE") {
      // Delete product and variants (cascade)
      await prisma.product.deleteMany({
        where: {
          shopId: shop.id,
          shopifyProductId,
        },
      });
      console.log(`[Webhook] Product ${shopifyProductId} deleted`);
      return { success: true };
    }

    // Parse tags from comma-separated string
    const tags = payload.tags
      ? payload.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    // Check if product should be auto-enabled based on inclusion tag
    const shouldAutoEnable = hasInclusionTag(tags, shop.productInclusionTag);

    // Check existing product to preserve manual enablement
    const existingProduct = await prisma.product.findUnique({
      where: {
        shopId_shopifyProductId: {
          shopId: shop.id,
          shopifyProductId,
        },
      },
      select: { id: true, enabledForFieldApp: true },
    });

    // Auto-enable if tag matches, but never auto-disable
    const enabledForFieldApp = shouldAutoEnable || (existingProduct?.enabledForFieldApp ?? false);

    const now = new Date();
    const imageUrl = payload.image?.src || payload.images?.[0]?.src || null;

    // Create or update product
    const product = await prisma.product.upsert({
      where: {
        shopId_shopifyProductId: {
          shopId: shop.id,
          shopifyProductId,
        },
      },
      create: {
        shopId: shop.id,
        shopifyProductId,
        title: payload.title,
        description: payload.body_html,
        imageUrl,
        productType: payload.product_type,
        vendor: payload.vendor,
        tags,
        status: mapProductStatus(payload.status),
        isActive: payload.status === "active",
        enabledForFieldApp,
        syncedAt: now,
      },
      update: {
        title: payload.title,
        description: payload.body_html,
        imageUrl,
        productType: payload.product_type,
        vendor: payload.vendor,
        tags,
        status: mapProductStatus(payload.status),
        isActive: payload.status === "active",
        enabledForFieldApp,
        syncedAt: now,
      },
    });

    console.log(`[Webhook] Product ${shopifyProductId} upserted: ${payload.title}`);

    // Process variants if present
    if (payload.variants && payload.variants.length > 0) {
      const existingVariants = await prisma.productVariant.findMany({
        where: { productId: product.id },
        select: { shopifyVariantId: true },
      });
      const existingVariantIds = new Set(existingVariants.map((v) => v.shopifyVariantId));
      const incomingVariantIds = new Set<string>();

      for (const variant of payload.variants) {
        // Store numeric ID only (not full GID)
        const shopifyVariantId = String(variant.id);
        incomingVariantIds.add(shopifyVariantId);

        await prisma.productVariant.upsert({
          where: {
            productId_shopifyVariantId: {
              productId: product.id,
              shopifyVariantId,
            },
          },
          create: {
            productId: product.id,
            shopifyVariantId,
            title: variant.title,
            sku: variant.sku,
            priceCents: priceToCents(variant.price),
            comparePriceCents: priceToCents(variant.compare_at_price),
            inventoryQuantity: variant.inventory_quantity,
            isAvailable: true,
            position: variant.position,
          },
          update: {
            title: variant.title,
            sku: variant.sku,
            priceCents: priceToCents(variant.price),
            comparePriceCents: priceToCents(variant.compare_at_price),
            inventoryQuantity: variant.inventory_quantity,
            position: variant.position,
          },
        });
      }

      // Delete variants that no longer exist
      const variantsToDelete = [...existingVariantIds].filter(
        (id) => !incomingVariantIds.has(id)
      );
      if (variantsToDelete.length > 0) {
        await prisma.productVariant.deleteMany({
          where: {
            productId: product.id,
            shopifyVariantId: { in: variantsToDelete },
          },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`[Webhook] Error processing product:`, error);
    return { success: false, error: String(error) };
  }
}
