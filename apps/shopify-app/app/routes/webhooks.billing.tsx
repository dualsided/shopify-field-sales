import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  handleSubscriptionUpdate,
  cancelBilling,
  syncUsageLineItemId,
  getPlanConfig,
} from "../services/billing.server";
import { prisma } from "@field-sales/database";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop: shopDomain, payload } = await authenticate.webhook(request);

  console.log(`[Billing Webhook] Received ${topic} for ${shopDomain}`);

  try {
    switch (topic) {
      case "APP_SUBSCRIPTIONS_UPDATE": {
        // Handle subscription status changes
        const subscriptionPayload = payload as {
          app_subscription?: {
            admin_graphql_api_id?: string;
            status?: string;
            current_period_end?: string;
          };
        };

        const result = await handleSubscriptionUpdate(shopDomain, subscriptionPayload);
        if (!result.success) {
          console.error(`[Billing Webhook] Failed to handle subscription update:`, result.error);
          break;
        }

        // Get shop to check if billing period changed
        const shop = await prisma.shop.findUnique({
          where: { shopifyDomain: shopDomain },
          select: {
            id: true,
            usageLineItemId: true,
            currentPeriodEnd: true,
            billingStatus: true,
          },
        });

        if (!shop) break;

        // Get admin client to report usage
        const { admin } = await unauthenticated.admin(shopDomain);

        // Sync usage line item ID if not set
        if (!shop.usageLineItemId) {
          console.log(`[Billing Webhook] Syncing usage line item ID for ${shopDomain}`);
          await syncUsageLineItemId(admin, shop.id);
        }

        // Check if period end changed (new billing cycle starting)
        const newPeriodEnd = subscriptionPayload.app_subscription?.current_period_end;
        if (newPeriodEnd && shop.currentPeriodEnd) {
          const newEndDate = new Date(newPeriodEnd);
          const currentEndDate = new Date(shop.currentPeriodEnd);

          // If period end changed, start a new billing period
          // Note: Usage is reported daily, not at period boundaries
          if (newEndDate.getTime() !== currentEndDate.getTime()) {
            console.log(`[Billing Webhook] Billing cycle changed for ${shopDomain}`);

            const periodStart = new Date();
            const periodEnd = new Date(newPeriodEnd);

            // Get shop's plan config for the new billing period
            const fullShop = await prisma.shop.findUnique({
              where: { id: shop.id },
              select: { billingPlan: true },
            });

            if (fullShop?.billingPlan) {
              const planConfig = getPlanConfig(fullShop.billingPlan);

              // Close current billing period
              await prisma.billingPeriod.updateMany({
                where: { shopId: shop.id, status: "open" },
                data: { status: "closed", finalizedAt: new Date() },
              });

              // Create new billing period
              await prisma.billingPeriod.create({
                data: {
                  shopId: shop.id,
                  periodStart,
                  periodEnd,
                  plan: fullShop.billingPlan,
                  includedReps: planConfig.includedReps,
                  perRepCents: planConfig.perRepCents,
                  revenueSharePercent: planConfig.revenueSharePercent,
                },
              });

              // Update shop period dates
              await prisma.shop.update({
                where: { id: shop.id },
                data: {
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                },
              });

              console.log(`[Billing Webhook] Created new billing period for ${shopDomain}`);
            }
          }
        }
        break;
      }

      // Note: SUBSCRIPTION_BILLING_ATTEMPTS_* webhooks are for merchant subscription contracts,
      // not app billing. App billing status changes are handled via APP_SUBSCRIPTIONS_UPDATE.
      // The subscription status will be FROZEN for payment failures, ACTIVE for success.

      case "APP_SUBSCRIPTIONS_APPROACHING_CAPPED_AMOUNT": {
        // Usage is approaching 90% of capped amount
        // This is a warning - we could notify the merchant or auto-increase cap
        const approachingPayload = payload as {
          app_subscription?: {
            admin_graphql_api_id?: string;
            capped_amount?: string;
            balance_used?: string;
          };
        };

        const cappedAmount = approachingPayload.app_subscription?.capped_amount;
        const balanceUsed = approachingPayload.app_subscription?.balance_used;

        console.log(`[Billing Webhook] Usage approaching cap for ${shopDomain}: ${balanceUsed} / ${cappedAmount}`);

        // TODO: Consider auto-increasing cap or notifying merchant
        // For now, just log it - Shopify will block usage records if cap is reached
        break;
      }

      case "APP_UNINSTALLED": {
        // App uninstalled - cancel billing
        const shop = await prisma.shop.findUnique({
          where: { shopifyDomain: shopDomain },
        });

        if (shop) {
          await cancelBilling(shop.id);
        }
        break;
      }

      default:
        console.log(`[Billing Webhook] Unhandled topic: ${topic}`);
    }
  } catch (error) {
    console.error(`[Billing Webhook] Error processing ${topic}:`, error);
  }

  return new Response(null, { status: 200 });
};
