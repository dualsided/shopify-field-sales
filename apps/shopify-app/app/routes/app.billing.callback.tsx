import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { activateBilling } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return redirect("/app?error=shop_not_found");
  }

  // The charge_id query param indicates merchant approved
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) {
    // Merchant likely declined
    return redirect("/app/billing?error=declined");
  }

  // Get the subscription ID we stored when creating the subscription
  const subscriptionId = shop.shopifySubscriptionId;

  if (!subscriptionId) {
    return redirect("/app/billing?error=no_subscription");
  }

  // Activate billing
  const result = await activateBilling(shop.id, subscriptionId);

  if (!result.success) {
    console.error("Failed to activate billing:", result.error);
    return redirect(`/app/billing?error=${encodeURIComponent(result.error || "activation_failed")}`);
  }

  // Success! Redirect to main app
  return redirect("/app?billing=success");
};
