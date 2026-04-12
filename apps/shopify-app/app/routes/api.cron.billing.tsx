import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  getShopsForDailyUsageReporting,
  reportDailyUsageForShop,
  syncUsageLineItemId,
  type DailyUsageResult,
} from "../services/billing.server";
import { prisma } from "@field-sales/database";

// Secret key to protect internal endpoints
const APP_SECRET = process.env.APP_SECRET;

/**
 * Daily usage billing cron endpoint
 *
 * Run daily via GitHub Actions to report usage to Shopify:
 * - Revenue share: (Orders PAID) - (Orders REFUNDED) = net revenue
 * - Extra reps: Charges for reps beyond included count
 *
 * Trigger with: POST /api/cron/billing
 * Headers: x-app-secret: <APP_SECRET>
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify app secret
  const secret = request.headers.get("x-app-secret");
  if (APP_SECRET && secret !== APP_SECRET) {
    console.log("[Daily Billing] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  console.log(`[Daily Billing] Starting at ${now.toISOString()}`);

  // Get all shops that need usage reporting
  const shops = await getShopsForDailyUsageReporting();
  console.log(`[Daily Billing] Found ${shops.length} shops to process`);

  const results: DailyUsageResult[] = [];
  const errors: Array<{ shop: string; error: string }> = [];

  for (const shop of shops) {
    try {
      console.log(`[Daily Billing] Processing ${shop.shopifyDomain}`);

      // Get admin client for this shop
      const { admin } = await unauthenticated.admin(shop.shopifyDomain);

      // Check if usage line item ID needs syncing
      const shopData = await prisma.shop.findUnique({
        where: { id: shop.id },
        select: { usageLineItemId: true },
      });

      if (!shopData?.usageLineItemId) {
        console.log(`[Daily Billing] Syncing usage line item ID for ${shop.shopifyDomain}`);
        const syncResult = await syncUsageLineItemId(admin, shop.id);
        if (!syncResult.success) {
          errors.push({
            shop: shop.shopifyDomain,
            error: `Failed to sync line item ID: ${syncResult.error}`,
          });
          continue;
        }
      }

      // Report daily usage
      const result = await reportDailyUsageForShop(shop.id, admin);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`[Daily Billing] Error processing ${shop.shopifyDomain}:`, error);
      errors.push({
        shop: shop.shopifyDomain,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Summary
  const successCount = results.filter(
    (r) => r.revenueShare.reported && r.extraReps.reported
  ).length;

  const totalRevenueShare = results.reduce(
    (sum, r) => sum + r.revenueShare.revenueShareCents,
    0
  );
  const totalRepCharges = results.reduce(
    (sum, r) => sum + r.extraReps.chargeCents,
    0
  );

  console.log(`[Daily Billing] Completed: ${successCount}/${shops.length} successful`);
  console.log(`[Daily Billing] Total charges: $${((totalRevenueShare + totalRepCharges) / 100).toFixed(2)}`);

  return Response.json({
    success: true,
    timestamp: now.toISOString(),
    summary: {
      shopsProcessed: shops.length,
      successful: successCount,
      errors: errors.length,
      totalRevenueShareCents: totalRevenueShare,
      totalRepChargesCents: totalRepCharges,
      totalChargesCents: totalRevenueShare + totalRepCharges,
    },
    results,
    errors,
  });
};

// GET endpoint for status check
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (APP_SECRET && secret !== APP_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shops = await getShopsForDailyUsageReporting();

  // Get count of unreported orders
  const unreportedOrders = await prisma.order.count({
    where: {
      status: { in: ["PAID", "REFUNDED"] },
      revenueShareReportedAt: null,
    },
  });

  return Response.json({
    message: "Daily billing cron endpoint. POST to trigger usage reporting.",
    currentDate: new Date().toISOString(),
    activeShops: shops.length,
    unreportedOrders,
  });
};
