import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "@field-sales/database";
import { getBillingDashboardData, PLAN_CONFIGS, type PlanConfig } from "../services/billing.server";
import type { BillingPlan } from "@prisma/client";

interface LoaderData {
  shop: {
    billingPlan: BillingPlan | null;
    billingStatus: string;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  } | null;
  status: {
    status: string;
    plan: BillingPlan | null;
    trialDaysRemaining: number | null;
    isActive: boolean;
    isTrial: boolean;
    requiresBilling: boolean;
  };
  usage: {
    activeRepCount: number;
    includedReps: number;
    extraRepCount: number;
    repChargesCents: number;
    orderCount: number;
    orderRevenueCents: number;
    revenueShareCents: number;
    totalChargesCents: number;
  };
  planConfig: PlanConfig | null;
  history: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    plan: BillingPlan;
    activeRepCount: number;
    repChargesCents: number;
    orderRevenueCents: number;
    revenueShareCents: number;
    status: string;
  }>;
  allPlans: Array<{ key: BillingPlan } & PlanConfig>;
  shopId: string | null;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return {
      shop: null,
      status: {
        status: "INACTIVE",
        plan: null,
        trialDaysRemaining: null,
        isActive: false,
        isTrial: false,
        requiresBilling: true,
      },
      usage: {
        activeRepCount: 0,
        includedReps: 0,
        extraRepCount: 0,
        repChargesCents: 0,
        orderCount: 0,
        orderRevenueCents: 0,
        revenueShareCents: 0,
        totalChargesCents: 0,
      },
      planConfig: null,
      history: [],
      allPlans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
        key: key as BillingPlan,
        ...config,
      })),
      shopId: null,
    };
  }

  const data = await getBillingDashboardData(shop.id);

  if (!data) {
    return {
      shop: null,
      status: {
        status: "INACTIVE",
        plan: null,
        trialDaysRemaining: null,
        isActive: false,
        isTrial: false,
        requiresBilling: true,
      },
      usage: {
        activeRepCount: 0,
        includedReps: 0,
        extraRepCount: 0,
        repChargesCents: 0,
        orderCount: 0,
        orderRevenueCents: 0,
        revenueShareCents: 0,
        totalChargesCents: 0,
      },
      planConfig: null,
      history: [],
      allPlans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
        key: key as BillingPlan,
        ...config,
      })),
      shopId: shop.id,
    };
  }

  return {
    shop: data.shop
      ? {
          ...data.shop,
          trialEndsAt: data.shop.trialEndsAt?.toISOString() || null,
          currentPeriodStart: data.shop.currentPeriodStart?.toISOString() || null,
          currentPeriodEnd: data.shop.currentPeriodEnd?.toISOString() || null,
        }
      : null,
    status: data.status,
    usage: data.usage,
    planConfig: data.planConfig,
    history: data.history.map((h) => ({
      ...h,
      periodStart: h.periodStart.toISOString(),
      periodEnd: h.periodEnd.toISOString(),
    })),
    allPlans: data.allPlans,
    shopId: shop.id,
  };
};

export default function BillingPage() {
  const { shop, status, usage, planConfig, history, allPlans, shopId } =
    useLoaderData<LoaderData>();
  const navigate = useNavigate();

  if (!shopId) {
    return (
      <s-page heading="Billing">
        <s-section>
          <s-banner tone="warning">
            Your store needs to complete setup before viewing billing.
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  // Not subscribed yet
  if (status.status === "INACTIVE" || status.requiresBilling) {
    return (
      <s-page heading="Billing">
        <s-section>
          <s-stack gap="base">
            <s-banner tone="info">
              Subscribe to start using Field Sales Manager. Choose a plan to get started.
            </s-banner>

            <s-heading>Choose Your Plan</s-heading>

            <s-grid gap="base" gridTemplateColumns="1fr 1fr">
              {allPlans.map((plan) => (
                <s-box
                  key={plan.key}
                  padding="base"
                  background="subdued"
                  borderRadius="base"
                >
                  <s-stack gap="base">
                    <s-heading>{plan.name}</s-heading>
                    <s-text type="strong">{formatCents(plan.basePriceCents)}/month</s-text>
                    <s-stack gap="none">
                      <s-text>{plan.includedReps} sales reps included</s-text>
                      <s-text>{formatCents(plan.perRepCents)}/rep for additional</s-text>
                      <s-text>{plan.revenueSharePercent}% revenue share</s-text>
                    </s-stack>
                    <s-button
                      variant="primary"
                      onClick={() => navigate(`/app/billing/subscribe?plan=${plan.key}`)}
                    >
                      Choose {plan.name}
                    </s-button>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Billing">

      {/* Current Plan */}
      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" justifyContent="space-between">
            <s-heading>Current Plan</s-heading>
            <s-button variant="tertiary" href="/app/billing/subscribe">Change Plan</s-button>
          </s-stack>

          <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Plan</s-text>
                <s-heading>{planConfig?.name || "None"}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Base Price</s-text>
                <s-heading>
                  {planConfig ? formatCents(planConfig.basePriceCents) : "$0"}/mo
                </s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-500">
                <s-text color="subdued">Status</s-text>
                <s-stack direction="inline" gap="small-300">
                  <s-badge
                    tone={
                      status.isActive
                        ? "success"
                        : status.status === "PAST_DUE"
                          ? "warning"
                          : "critical"
                    }
                  >
                    {status.isTrial ? "Trial" : status.status}
                  </s-badge>
                  {status.isTrial &&
                    <s-paragraph>
                      <s-text tone={"info"} color="subdued">
                        Ends in {status.trialDaysRemaining} day{status.trialDaysRemaining !== 1 ? "s" : ""}
                      </s-text>
                    </s-paragraph>
                  }
                </s-stack>
              </s-stack>
            </s-box>
          </s-grid>

          {shop?.currentPeriodStart && shop?.currentPeriodEnd && (
            <s-text color="subdued">
              Current period: {formatDate(shop.currentPeriodStart)} -{" "}
              {formatDate(shop.currentPeriodEnd)}
            </s-text>
          )}
        </s-stack>
      </s-section>

      {/* Current Usage */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Current Period Usage</s-heading>

          <s-grid gap="base" gridTemplateColumns="1fr 1fr">
            {/* Rep Usage */}
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="base">
                <s-text type="strong">Sales Reps</s-text>
                <s-grid gap="base" gridTemplateColumns="1fr 1fr">
                  <s-stack gap="none">
                    <s-text color="subdued">Active</s-text>
                    <s-text type="strong">{usage.activeRepCount}</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Included</s-text>
                    <s-text>{usage.includedReps}</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Extra</s-text>
                    <s-text>{usage.extraRepCount}</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Charges</s-text>
                    <s-text type="strong">{formatCents(usage.repChargesCents)}</s-text>
                  </s-stack>
                </s-grid>
              </s-stack>
            </s-box>

            {/* Revenue Share */}
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="base">
                <s-text type="strong">Revenue Share</s-text>
                <s-grid gap="base" gridTemplateColumns="1fr 1fr">
                  <s-stack gap="none">
                    <s-text color="subdued">Orders</s-text>
                    <s-text type="strong">{usage.orderCount}</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Revenue</s-text>
                    <s-text>{formatCents(usage.orderRevenueCents)}</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Rate</s-text>
                    <s-text>{planConfig?.revenueSharePercent || 0}%</s-text>
                  </s-stack>
                  <s-stack gap="none">
                    <s-text color="subdued">Share</s-text>
                    <s-text type="strong">{formatCents(usage.revenueShareCents)}</s-text>
                  </s-stack>
                </s-grid>
              </s-stack>
            </s-box>
          </s-grid>

          {/* Total */}
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-grid gap="base" gridTemplateColumns="1fr auto">
              <s-text type="strong">Estimated Usage Charges This Period</s-text>
              <s-text type="strong">{formatCents(usage.totalChargesCents)}</s-text>
            </s-grid>
          </s-box>
        </s-stack>
      </s-section>

      {/* Billing History */}
      {history.length > 0 && (
        <s-section>
          <s-stack gap="base">
            <s-heading>Billing History</s-heading>
            <s-table>
              <s-table-header-row>
                <s-table-header>Period</s-table-header>
                <s-table-header>Plan</s-table-header>
                <s-table-header>Reps</s-table-header>
                <s-table-header>Revenue</s-table-header>
                <s-table-header>Total</s-table-header>
                <s-table-header>Status</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {history.map((period) => (
                  <s-table-row key={period.id}>
                    <s-table-cell>
                      {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                    </s-table-cell>
                    <s-table-cell>{period.plan}</s-table-cell>
                    <s-table-cell>{period.activeRepCount}</s-table-cell>
                    <s-table-cell>{formatCents(period.orderRevenueCents)}</s-table-cell>
                    <s-table-cell>
                      {formatCents(period.repChargesCents + period.revenueShareCents)}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge
                        tone={period.status === "billed" ? "success" : "info"}
                      >
                        {period.status}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-stack>
        </s-section>
      )}

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
