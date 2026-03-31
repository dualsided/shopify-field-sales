import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleSubscriptionUpdate, cancelBilling } from "../services/billing.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop: shopDomain, payload } = await authenticate.webhook(request);

  console.log(`[Billing Webhook] Received ${topic} for ${shopDomain}`);

  try {
    switch (topic) {
      case "APP_SUBSCRIPTIONS_UPDATE": {
        const result = await handleSubscriptionUpdate(shopDomain, payload as {
          app_subscription?: {
            admin_graphql_api_id?: string;
            status?: string;
            current_period_end?: string;
          };
        });
        if (!result.success) {
          console.error(`[Billing Webhook] Failed to handle subscription update:`, result.error);
        }
        break;
      }

      case "SUBSCRIPTION_BILLING_ATTEMPTS_SUCCESS": {
        // Payment succeeded - update billing period status
        const shop = await prisma.shop.findUnique({
          where: { shopifyDomain: shopDomain },
        });

        if (shop) {
          // Mark current period as billed
          await prisma.billingPeriod.updateMany({
            where: {
              shopId: shop.id,
              status: "finalized",
            },
            data: {
              status: "billed",
            },
          });

          // If coming from trial, update to active
          if (shop.billingStatus === "TRIAL") {
            await prisma.shop.update({
              where: { id: shop.id },
              data: { billingStatus: "ACTIVE" },
            });
          }
        }
        break;
      }

      case "SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE": {
        // Payment failed
        const shop = await prisma.shop.findUnique({
          where: { shopifyDomain: shopDomain },
        });

        if (shop) {
          await prisma.shop.update({
            where: { id: shop.id },
            data: { billingStatus: "PAST_DUE" },
          });

          // Mark period as failed
          await prisma.billingPeriod.updateMany({
            where: {
              shopId: shop.id,
              status: "finalized",
            },
            data: {
              status: "failed",
            },
          });
        }
        break;
      }

      case "SUBSCRIPTION_BILLING_ATTEMPTS_CHALLENGED": {
        // Payment challenged (fraud, etc.)
        console.log(`[Billing Webhook] Payment challenged for ${shopDomain}`);
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
