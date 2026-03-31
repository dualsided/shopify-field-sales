import prisma from "../db.server";
import type { BillingPlan, BillingStatus } from "@prisma/client";

// ============================================
// Plan Configuration
// ============================================

export interface PlanConfig {
  name: string;
  includedReps: number;
  perRepCents: number;       // Per rep price in cents
  basePriceCents: number;    // includedReps * perRepCents
  revenueSharePercent: number; // e.g., 0.50 for 0.50%
}

export const PLAN_CONFIGS: Record<BillingPlan, PlanConfig> = {
  BASIC: {
    name: "Basic",
    includedReps: 10,
    perRepCents: 1000,      // $10
    basePriceCents: 10000,  // $100
    revenueSharePercent: 0.50,
  },
  GROW: {
    name: "Grow",
    includedReps: 25,
    perRepCents: 800,       // $8
    basePriceCents: 20000,  // $200
    revenueSharePercent: 0.45,
  },
  PRO: {
    name: "Pro",
    includedReps: 50,
    perRepCents: 600,       // $6
    basePriceCents: 30000,  // $300
    revenueSharePercent: 0.40,
  },
  PLUS: {
    name: "Plus",
    includedReps: 100,
    perRepCents: 500,       // $5
    basePriceCents: 50000,  // $500
    revenueSharePercent: 0.35,
  },
};

export const TRIAL_DAYS = 7;

// ============================================
// Types
// ============================================

export interface BillingStatusInfo {
  status: BillingStatus;
  plan: BillingPlan | null;
  trialEndsAt: Date | null;
  trialDaysRemaining: number | null;
  isActive: boolean;
  isTrial: boolean;
  requiresBilling: boolean;
}

export interface SubscriptionResult {
  success: boolean;
  confirmationUrl?: string;
  subscriptionId?: string;
  error?: string;
}

export interface UsageReportResult {
  success: boolean;
  usageRecordId?: string;
  error?: string;
}

export interface UsageCharges {
  activeRepCount: number;
  includedReps: number;
  extraRepCount: number;
  repChargesCents: number;
  orderCount: number;
  orderRevenueCents: number;
  revenueShareCents: number;
  totalChargesCents: number;
}

// ============================================
// GraphQL Mutations
// ============================================

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $trialDays: Int
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      lineItems: $lineItems
    ) {
      appSubscription {
        id
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppUsagePricing {
                terms
                cappedAmount {
                  amount
                  currencyCode
                }
              }
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_USAGE_RECORD_CREATE = `#graphql
  mutation AppUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
    $idempotencyKey: String!
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CURRENT_APP_INSTALLATION = `#graphql
  query CurrentAppInstallation {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              ... on AppUsagePricing {
                terms
                cappedAmount {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ============================================
// Core Functions
// ============================================

/**
 * Get plan configuration for a billing plan
 */
export function getPlanConfig(plan: BillingPlan): PlanConfig {
  return PLAN_CONFIGS[plan];
}

/**
 * Get billing status information for a shop
 */
export async function getBillingStatus(shopId: string): Promise<BillingStatusInfo> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      billingStatus: true,
      billingPlan: true,
      trialEndsAt: true,
    },
  });

  if (!shop) {
    return {
      status: "INACTIVE",
      plan: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
      isActive: false,
      isTrial: false,
      requiresBilling: true,
    };
  }

  const now = new Date();
  const trialEndsAt = shop.trialEndsAt;
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const isTrial = shop.billingStatus === "TRIAL";
  const trialExpired = isTrial && trialEndsAt && now > trialEndsAt;
  const isActive = shop.billingStatus === "ACTIVE" || (isTrial && !trialExpired);
  const requiresBilling = !isActive || (trialDaysRemaining !== null && trialDaysRemaining <= 0);

  return {
    status: shop.billingStatus,
    plan: shop.billingPlan,
    trialEndsAt,
    trialDaysRemaining,
    isActive,
    isTrial,
    requiresBilling,
  };
}

/**
 * Check if shop has active billing (or is in trial)
 */
export async function hasActiveBilling(shopId: string): Promise<boolean> {
  const status = await getBillingStatus(shopId);
  return status.isActive;
}

/**
 * Create a billing subscription for a shop
 */
export async function createBillingSubscription(
  shopId: string,
  plan: BillingPlan,
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  returnUrl: string,
  isTest: boolean = false
): Promise<SubscriptionResult> {
  const planConfig = getPlanConfig(plan);

  // Calculate capped amounts (reasonable limits)
  const repCappedAmount = planConfig.perRepCents * 200 / 100; // 200 extra reps max
  const revenueCappedAmount = 10000; // $10,000 max revenue share per period

  try {
    const response = await admin.graphql(APP_SUBSCRIPTION_CREATE, {
      variables: {
        name: `Field Sales Manager - ${planConfig.name}`,
        returnUrl,
        test: isTest,
        trialDays: TRIAL_DAYS,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: (planConfig.basePriceCents / 100).toFixed(2),
                  currencyCode: "USD",
                },
                interval: "EVERY_30_DAYS",
              },
            },
          },
          {
            plan: {
              appUsagePricingDetails: {
                terms: `$${(planConfig.perRepCents / 100).toFixed(2)} per additional sales rep beyond ${planConfig.includedReps} included`,
                cappedAmount: {
                  amount: repCappedAmount.toFixed(2),
                  currencyCode: "USD",
                },
              },
            },
          },
          {
            plan: {
              appUsagePricingDetails: {
                terms: `${planConfig.revenueSharePercent}% of order revenue processed through the app`,
                cappedAmount: {
                  amount: revenueCappedAmount.toFixed(2),
                  currencyCode: "USD",
                },
              },
            },
          },
        ],
      },
    });

    const result = await response.json();

    if (result.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = result.data.appSubscriptionCreate.userErrors;
      return {
        success: false,
        error: errors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    const subscription = result.data?.appSubscriptionCreate?.appSubscription;
    const confirmationUrl = result.data?.appSubscriptionCreate?.confirmationUrl;

    if (!subscription || !confirmationUrl) {
      return {
        success: false,
        error: "Failed to create subscription",
      };
    }

    // Update shop with pending subscription
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        billingPlan: plan,
        shopifySubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });

    return {
      success: true,
      confirmationUrl,
      subscriptionId: subscription.id,
    };
  } catch (error) {
    console.error("Error creating subscription:", error);
    return {
      success: false,
      error: "Failed to create subscription",
    };
  }
}

/**
 * Activate billing after merchant approves subscription
 */
export async function activateBilling(
  shopId: string,
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  try {
    await prisma.$transaction(async (tx) => {
      // Update shop billing status
      await tx.shop.update({
        where: { id: shopId },
        data: {
          billingStatus: "TRIAL",
          subscriptionStatus: "ACTIVE",
          shopifySubscriptionId: subscriptionId,
          trialEndsAt,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      // Create initial billing period
      const planConfig = shop.billingPlan ? getPlanConfig(shop.billingPlan) : PLAN_CONFIGS.BASIC;

      await tx.billingPeriod.create({
        data: {
          shopId,
          periodStart,
          periodEnd,
          plan: shop.billingPlan || "BASIC",
          includedReps: planConfig.includedReps,
          perRepCents: planConfig.perRepCents,
          revenueSharePercent: planConfig.revenueSharePercent,
        },
      });

      // Backfill activatedAt for existing active reps
      await tx.salesRep.updateMany({
        where: {
          shopId,
          isActive: true,
          activatedAt: null,
        },
        data: {
          activatedAt: new Date(),
        },
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error activating billing:", error);
    return { success: false, error: "Failed to activate billing" };
  }
}

/**
 * Get or create current billing period for a shop
 */
export async function getCurrentBillingPeriod(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      billingPlan: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  if (!shop || !shop.currentPeriodStart || !shop.currentPeriodEnd) {
    return null;
  }

  // Find existing period
  let period = await prisma.billingPeriod.findUnique({
    where: {
      shopId_periodStart: {
        shopId,
        periodStart: shop.currentPeriodStart,
      },
    },
  });

  // Create if doesn't exist
  if (!period && shop.billingPlan) {
    const planConfig = getPlanConfig(shop.billingPlan);
    period = await prisma.billingPeriod.create({
      data: {
        shopId,
        periodStart: shop.currentPeriodStart,
        periodEnd: shop.currentPeriodEnd,
        plan: shop.billingPlan,
        includedReps: planConfig.includedReps,
        perRepCents: planConfig.perRepCents,
        revenueSharePercent: planConfig.revenueSharePercent,
      },
    });
  }

  return period;
}

/**
 * Calculate usage charges for a shop
 */
export async function calculateUsageCharges(shopId: string): Promise<UsageCharges> {
  const period = await getCurrentBillingPeriod(shopId);

  if (!period) {
    return {
      activeRepCount: 0,
      includedReps: 0,
      extraRepCount: 0,
      repChargesCents: 0,
      orderCount: 0,
      orderRevenueCents: 0,
      revenueShareCents: 0,
      totalChargesCents: 0,
    };
  }

  // Count active reps
  const activeRepCount = await prisma.salesRep.count({
    where: { shopId, isActive: true },
  });

  // Calculate extra rep charges
  const extraRepCount = Math.max(0, activeRepCount - period.includedReps);
  const repChargesCents = extraRepCount * period.perRepCents;

  // Get unbilled paid orders for revenue share
  const unbilledOrders = await prisma.order.findMany({
    where: {
      shopId,
      status: "PAID",
      paidAt: {
        gte: period.periodStart,
        lte: period.periodEnd,
      },
      billedOrder: null,
    },
    select: { id: true, totalCents: true },
  });

  const orderRevenueCents = unbilledOrders.reduce((sum, o) => sum + o.totalCents, 0);
  const revenueShareCents = Math.round(orderRevenueCents * (period.revenueSharePercent / 100));

  return {
    activeRepCount,
    includedReps: period.includedReps,
    extraRepCount,
    repChargesCents,
    orderCount: unbilledOrders.length,
    orderRevenueCents,
    revenueShareCents,
    totalChargesCents: repChargesCents + revenueShareCents,
  };
}

/**
 * Record an order as billed for revenue share
 */
export async function recordBilledOrder(
  orderId: string,
  billingPeriodId: string,
  revenueSharePercent: number
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalCents: true },
  });

  if (!order) return;

  const revenueShareCents = Math.round(order.totalCents * (revenueSharePercent / 100));

  await prisma.$transaction(async (tx) => {
    // Create billed order record
    await tx.billedOrder.create({
      data: {
        billingPeriodId,
        orderId,
        totalCents: order.totalCents,
        revenueShareCents,
      },
    });

    // Update billing period totals
    await tx.billingPeriod.update({
      where: { id: billingPeriodId },
      data: {
        orderRevenueCents: { increment: order.totalCents },
        revenueShareCents: { increment: revenueShareCents },
      },
    });
  });
}

/**
 * Handle subscription webhook updates
 */
export async function handleSubscriptionUpdate(
  shopDomain: string,
  payload: {
    app_subscription?: {
      admin_graphql_api_id?: string;
      status?: string;
      current_period_end?: string;
    };
  }
): Promise<{ success: boolean; error?: string }> {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const subscription = payload.app_subscription;
  if (!subscription) {
    return { success: false, error: "No subscription in payload" };
  }

  const status = subscription.status?.toUpperCase();

  let billingStatus: BillingStatus = shop.billingStatus;
  if (status === "ACTIVE") {
    // Check if still in trial
    if (shop.trialEndsAt && new Date() < shop.trialEndsAt) {
      billingStatus = "TRIAL";
    } else {
      billingStatus = "ACTIVE";
    }
  } else if (status === "CANCELLED" || status === "EXPIRED") {
    billingStatus = "CANCELLED";
  } else if (status === "FROZEN") {
    billingStatus = "PAST_DUE";
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      billingStatus,
      subscriptionStatus: status,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : undefined,
    },
  });

  return { success: true };
}

/**
 * Cancel billing for a shop (e.g., on app uninstall)
 */
export async function cancelBilling(shopId: string): Promise<void> {
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      billingStatus: "CANCELLED",
      subscriptionStatus: "CANCELLED",
    },
  });
}

/**
 * Get billing dashboard data
 */
export async function getBillingDashboardData(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      billingPlan: true,
      billingStatus: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });

  if (!shop) return null;

  const status = await getBillingStatus(shopId);
  const usage = await calculateUsageCharges(shopId);
  const planConfig = shop.billingPlan ? getPlanConfig(shop.billingPlan) : null;

  // Get billing history
  const history = await prisma.billingPeriod.findMany({
    where: { shopId },
    orderBy: { periodStart: "desc" },
    take: 6,
  });

  return {
    shop,
    status,
    usage,
    planConfig,
    history,
    allPlans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
      key: key as BillingPlan,
      ...config,
    })),
  };
}
