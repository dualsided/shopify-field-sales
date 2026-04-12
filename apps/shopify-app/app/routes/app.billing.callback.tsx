import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { prisma } from "@field-sales/database";
import { activateBilling, PLAN_CONFIGS } from "../services/billing.server";
import { getAuthenticatedShop } from "../services/shop.server";
import type { BillingPlan } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[Billing Callback] Starting callback handler");

  // Use redirect from authenticate.admin for embedded app compatibility
  const { redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  console.log("[Billing Callback] URL:", url.toString());

  let shop;
  try {
    const result = await getAuthenticatedShop(request);
    shop = result.shop;
  } catch {
    console.log("[Billing Callback] No shop found, redirecting to error");
    throw redirect("/app?error=shop_not_found");
  }

  console.log("[Billing Callback] Shop found:", { id: shop.id, billingStatus: shop.billingStatus, billingPlan: shop.billingPlan, subscriptionId: shop.shopifySubscriptionId });

  // The charge_id query param indicates merchant approved
  const chargeId = url.searchParams.get("charge_id");
  console.log("[Billing Callback] charge_id from URL:", chargeId);

  if (!chargeId) {
    // Merchant likely declined
    console.log("[Billing Callback] No charge_id, merchant declined");
    throw redirect("/app/billing?error=declined");
  }

  // Get the plan from the return URL
  const planParam = url.searchParams.get("plan")?.toUpperCase() as BillingPlan | undefined;
  console.log("[Billing Callback] plan from URL:", planParam);

  if (!planParam || !(planParam in PLAN_CONFIGS)) {
    console.log("[Billing Callback] Invalid or missing plan in URL");
    throw redirect("/app/billing?error=invalid_plan");
  }

  // Get the subscription ID we stored when creating the subscription
  const subscriptionId = shop.shopifySubscriptionId;
  console.log("[Billing Callback] Subscription ID from shop:", subscriptionId);

  if (!subscriptionId) {
    console.log("[Billing Callback] No subscription ID stored, redirecting to error");
    throw redirect("/app/billing?error=no_subscription");
  }

  // Activate billing with the approved plan
  console.log("[Billing Callback] Calling activateBilling with shopId:", shop.id, "subscriptionId:", subscriptionId, "plan:", planParam);
  const result = await activateBilling(shop.id, subscriptionId, planParam);
  console.log("[Billing Callback] activateBilling result:", result);

  if (!result.success) {
    console.error("[Billing Callback] Failed to activate billing:", result.error);
    throw redirect(`/app/billing?error=${encodeURIComponent(result.error || "activation_failed")}`);
  }

  // Verify the update worked
  const updatedShop = await prisma.shop.findUnique({
    where: { id: shop.id },
    select: { billingStatus: true, billingPlan: true, trialEndsAt: true },
  });
  console.log("[Billing Callback] Shop after activation:", updatedShop);

  // Success! Redirect to main app
  console.log("[Billing Callback] Success! Redirecting to /app?billing=success");
  throw redirect("/app?billing=success");
};
