import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBillingStatus } from "../services/billing.server";

interface LoaderData {
  apiKey: string;
  billingStatus: {
    status: string;
    isTrial: boolean;
    isActive: boolean;
    trialDaysRemaining: number | null;
    requiresBilling: boolean;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  // Default billing status for shops not yet set up
  let billingStatus = {
    status: "INACTIVE",
    isTrial: false,
    isActive: false,
    trialDaysRemaining: null as number | null,
    requiresBilling: true,
  };

  if (shop) {
    billingStatus = await getBillingStatus(shop.id);
  }

  // Check URL - allow access to billing pages even without active billing
  const url = new URL(request.url);
  const isBillingRoute = url.pathname.startsWith("/app/billing");

  // If billing is required (not active or trial) and not on billing page, redirect
  if (billingStatus.requiresBilling && !isBillingRoute) {
    throw redirect("/app/billing");
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", billingStatus };
};

export default function App() {
  const { apiKey, billingStatus } = useLoaderData<LoaderData>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/companies">Companies</s-link>
        <s-link href="/app/orders">Orders</s-link>
        <s-link href="/app/reps">Sales Reps</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>

      {/* Trial countdown banner */}
      {billingStatus.isTrial && billingStatus.trialDaysRemaining !== null && (
        <s-banner
          tone={billingStatus.trialDaysRemaining <= 3 ? "warning" : "info"}
        >
          {billingStatus.trialDaysRemaining > 0
            ? `Your trial ends in ${billingStatus.trialDaysRemaining} day${billingStatus.trialDaysRemaining !== 1 ? "s" : ""}. `
            : "Your trial has ended. "}
          <s-link href="/app/billing">View billing details</s-link>
        </s-banner>
      )}

      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
