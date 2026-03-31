# Billing

Subscription billing and usage tracking.

## Overview

Billing is handled through Shopify's App Billing API. The model includes:
- **Base subscription** - Monthly fee based on plan
- **Per-rep usage** - Charges for reps beyond included count
- **Revenue share** - Percentage of order revenue

## Plans

| Plan | Included Reps | Per Extra Rep | Base Price | Revenue Share |
|------|---------------|---------------|------------|---------------|
| Basic | 10 | $10/rep | $100/mo | 0.50% |
| Grow | 25 | $8/rep | $200/mo | 0.45% |
| Pro | 50 | $6/rep | $300/mo | 0.40% |
| Plus | 100 | $5/rep | $500/mo | 0.35% |

```typescript
// Plan configuration
const PLAN_CONFIGS: Record<BillingPlan, PlanConfig> = {
  BASIC: {
    name: "Basic",
    includedReps: 10,
    perRepCents: 1000,      // $10
    basePriceCents: 10000,  // $100
    revenueSharePercent: 0.50,
  },
  // ...
};
```

## Billing Status

| Status | Description |
|--------|-------------|
| `INACTIVE` | No subscription |
| `TRIAL` | In 7-day trial period |
| `ACTIVE` | Paid subscription active |
| `PAST_DUE` | Payment failed |
| `CANCELLED` | Subscription cancelled |

## Subscription Flow

### 1. Create Subscription

```typescript
const result = await createBillingSubscription(
  shopId,
  "GROW",           // Plan
  admin,            // Shopify admin API
  returnUrl,        // Callback URL
  isTest            // Test mode
);

// Returns confirmation URL for merchant to approve
// { success: true, confirmationUrl: "https://...", subscriptionId: "..." }
```

### 2. Merchant Approves

Merchant is redirected to Shopify to approve charges.

### 3. Activate Billing

After approval, callback triggers activation:

```typescript
await activateBilling(shopId, subscriptionId);
```

This:
- Sets `billingStatus` to `TRIAL`
- Sets `trialEndsAt` (7 days)
- Creates initial billing period
- Backfills `activatedAt` for existing reps

## Usage Tracking

### Active Rep Count

```typescript
const activeRepCount = await prisma.salesRep.count({
  where: { shopId, isActive: true },
});

const extraReps = Math.max(0, activeRepCount - planConfig.includedReps);
const repCharges = extraReps * planConfig.perRepCents;
```

### Revenue Share

When orders are marked PAID:

```typescript
await recordBilledOrder(orderId, billingPeriodId, revenueSharePercent);
```

This records the order for revenue share calculation:

```typescript
const revenueShareCents = Math.round(orderTotalCents * (0.50 / 100));
```

### Calculate Usage Charges

```typescript
const usage = await calculateUsageCharges(shopId);

// Returns:
{
  activeRepCount: 15,
  includedReps: 10,
  extraRepCount: 5,
  repChargesCents: 5000,      // 5 * $10 = $50
  orderCount: 100,
  orderRevenueCents: 5000000, // $50,000
  revenueShareCents: 25000,   // $250 (0.50%)
  totalChargesCents: 30000,   // $300 total usage
}
```

## Billing Period

Each 30-day billing cycle creates a `BillingPeriod`:

```typescript
{
  id: string;
  shopId: string;
  periodStart: Date;
  periodEnd: Date;
  plan: BillingPlan;
  includedReps: number;
  perRepCents: number;
  revenueSharePercent: number;

  // Accumulated totals
  repChargesCents: number;
  orderRevenueCents: number;
  revenueShareCents: number;
}
```

## Key Functions

### billing.server.ts

| Function | Description |
|----------|-------------|
| `getPlanConfig(plan)` | Get plan configuration |
| `getBillingStatus(shopId)` | Current billing status |
| `hasActiveBilling(shopId)` | Check if subscription active |
| `createBillingSubscription(...)` | Create Shopify subscription |
| `activateBilling(shopId, subscriptionId)` | Activate after approval |
| `getCurrentBillingPeriod(shopId)` | Get/create current period |
| `calculateUsageCharges(shopId)` | Calculate pending charges |
| `recordBilledOrder(...)` | Track order for revenue share |
| `handleSubscriptionUpdate(...)` | Process billing webhook |
| `cancelBilling(shopId)` | Cancel subscription |
| `getBillingDashboardData(shopId)` | Dashboard data |

## Webhooks

| Topic | Action |
|-------|--------|
| `APP_SUBSCRIPTIONS_UPDATE` | Update billing status |
| `APP_UNINSTALLED` | Cancel billing |

```typescript
// routes/webhooks.billing.tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  await handleSubscriptionUpdate(shop, payload);
  return new Response(null, { status: 200 });
};
```

## Routes

| Route | Purpose |
|-------|---------|
| `app.billing._index.tsx` | Billing dashboard |
| `app.billing.subscribe.tsx` | Plan selection |
| `app.billing.callback.tsx` | Post-approval callback |

## Dashboard Data

```typescript
const data = await getBillingDashboardData(shopId);

// Returns:
{
  shop: { billingPlan, billingStatus, trialEndsAt, ... },
  status: { isActive, isTrial, trialDaysRemaining, ... },
  usage: { activeRepCount, extraRepCount, repChargesCents, ... },
  planConfig: { name, includedReps, perRepCents, ... },
  history: [ /* past billing periods */ ],
  allPlans: [ /* all available plans */ ],
}
```

## Trial Period

- **Duration**: 7 days
- **Features**: Full access to all plan features
- **End of Trial**: Must approve charges or lose access

```typescript
const status = await getBillingStatus(shopId);

if (status.isTrial) {
  console.log(`Trial ends in ${status.trialDaysRemaining} days`);
}

if (status.requiresBilling) {
  // Redirect to billing page
}
```

## Testing

Set `isTest: true` when creating subscription for development:

```typescript
await createBillingSubscription(shopId, plan, admin, returnUrl, true);
```

Test subscriptions don't charge real money.
