import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, redirect } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  createBillingSubscription,
  PLAN_CONFIGS,
  TRIAL_DAYS,
  type PlanConfig,
} from "../services/billing.server";
import type { BillingPlan } from "@prisma/client";

interface LoaderData {
  selectedPlan: BillingPlan;
  planConfig: PlanConfig;
  allPlans: Array<{ key: BillingPlan } & PlanConfig>;
  shopId: string | null;
  trialDays: number;
}

interface ActionData {
  success?: boolean;
  confirmationUrl?: string;
  error?: string;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return redirect("/app");
  }

  // If already subscribed, redirect to billing dashboard
  if (shop.billingStatus === "ACTIVE" || shop.billingStatus === "TRIAL") {
    return redirect("/app/billing");
  }

  const planParam = url.searchParams.get("plan")?.toUpperCase() as BillingPlan | undefined;
  const selectedPlan: BillingPlan = planParam && planParam in PLAN_CONFIGS ? planParam : "BASIC";
  const planConfig = PLAN_CONFIGS[selectedPlan];

  return {
    selectedPlan,
    planConfig,
    allPlans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
      key: key as BillingPlan,
      ...config,
    })),
    shopId: shop.id,
    trialDays: TRIAL_DAYS,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const plan = formData.get("plan") as BillingPlan;

  if (!plan || !(plan in PLAN_CONFIGS)) {
    return { success: false, error: "Invalid plan selected" };
  }

  const appUrl = process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`;
  const returnUrl = `${appUrl}/app/billing/callback`;
  const isTest = process.env.NODE_ENV !== "production";

  const result = await createBillingSubscription(
    shop.id,
    plan,
    admin,
    returnUrl,
    isTest
  );

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    confirmationUrl: result.confirmationUrl,
  };
};

export default function BillingSubscribePage() {
  const { selectedPlan, planConfig, allPlans, shopId, trialDays } =
    useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.confirmationUrl) {
      // Redirect to Shopify billing approval page
      window.top!.location.href = fetcher.data.confirmationUrl;
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!shopId) {
    return (
      <s-page heading="Subscribe">
        <s-section>
          <s-banner tone="warning">
            Your store needs to complete setup before subscribing.
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const isSubmitting = fetcher.state !== "idle";

  return (
    <s-page heading="Subscribe to Field Sales Manager">
      <s-link slot="breadcrumb-actions" href="/app/billing">
        Billing
      </s-link>

      <s-section>
        <s-stack gap="base">
          <s-banner tone="info">
            Start with a {trialDays}-day free trial. No charges until your trial ends.
          </s-banner>

          {/* Selected Plan Details */}
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="base">
              <s-heading>{planConfig.name} Plan</s-heading>

              <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr">
                <s-stack gap="none">
                  <s-text color="subdued">Base Price</s-text>
                  <s-text type="strong">{formatCents(planConfig.basePriceCents)}/mo</s-text>
                </s-stack>
                <s-stack gap="none">
                  <s-text color="subdued">Included Reps</s-text>
                  <s-text type="strong">{planConfig.includedReps}</s-text>
                </s-stack>
                <s-stack gap="none">
                  <s-text color="subdued">Revenue Share</s-text>
                  <s-text type="strong">{planConfig.revenueSharePercent}%</s-text>
                </s-stack>
              </s-grid>

              <s-text color="subdued">
                Additional sales reps: {formatCents(planConfig.perRepCents)} each
              </s-text>
            </s-stack>
          </s-box>

          {/* Subscribe Button */}
          <fetcher.Form method="POST">
            <input type="hidden" name="plan" value={selectedPlan} />
            <s-button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : `Start ${trialDays}-Day Free Trial`}
            </s-button>
          </fetcher.Form>

          <s-text color="subdued">
            By subscribing, you agree to be charged after your trial period ends.
            You can cancel anytime from your Shopify admin.
          </s-text>
        </s-stack>
      </s-section>

      {/* Other Plans */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Other Plans</s-heading>
          <s-table>
            <s-table-header-row>
              <s-table-header>Plan</s-table-header>
              <s-table-header>Included Reps</s-table-header>
              <s-table-header>Per Rep</s-table-header>
              <s-table-header>Base Price</s-table-header>
              <s-table-header>Revenue Share</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {allPlans.map((plan) => (
                <s-table-row key={plan.key}>
                  <s-table-cell>
                    {plan.name}
                    {plan.key === selectedPlan && (
                      <s-badge tone="success">Selected</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>{plan.includedReps}</s-table-cell>
                  <s-table-cell>{formatCents(plan.perRepCents)}</s-table-cell>
                  <s-table-cell>{formatCents(plan.basePriceCents)}/mo</s-table-cell>
                  <s-table-cell>{plan.revenueSharePercent}%</s-table-cell>
                  <s-table-cell>
                    {plan.key !== selectedPlan && (
                      <s-link href={`/app/billing/subscribe?plan=${plan.key}`}>
                        Select
                      </s-link>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
