import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

interface DashboardData {
  shopName: string;
  companiesCount: number;
  hasManagedCompanies: boolean;
  shop: {
    id: string;
    isActive: boolean;
  } | null;
}

const COMPANIES_COUNT_QUERY = `#graphql
  query GetCompaniesCount {
    companies(first: 25) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Check if there are companies in Shopify
  let companiesCount = 0;
  try {
    const response = await admin.graphql(COMPANIES_COUNT_QUERY);
    const data = await response.json();
    companiesCount = data.data?.companies?.edges?.length || 0;
    if (data.data?.companies?.pageInfo?.hasNextPage) {
      companiesCount = 25; // More than 25
    }
  } catch (error) {
    console.error("Failed to fetch companies count:", error);
  }

  // Get shop info from our database
  let shop = null;
  let hasManagedCompanies = false;
  try {
    shop = await prisma.shop.findUnique({
      where: { shopifyDomain: session.shop },
      select: {
        id: true,
        isActive: true,
        hasManagedCompanies: true,
      },
    });
    hasManagedCompanies = shop?.hasManagedCompanies || false;
  } catch (error) {
    console.error("Failed to fetch shop:", error);
  }

  return {
    shopName: session.shop.replace(".myshopify.com", ""),
    companiesCount,
    hasManagedCompanies,
    shop,
  };
};

export default function Index() {
  const { shopName, companiesCount, hasManagedCompanies, shop } = useLoaderData<DashboardData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const openCompaniesAdmin = () => {
    // Open Shopify Admin Companies page
    shopify.intents.invoke?.("navigate:shopify/Company/index");
  };

  return (
    <s-page heading="Field Sales Manager">

      {/* Welcome Section */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Welcome, {shopName}!</s-heading>
          <s-paragraph>
            Field Sales Manager helps extend Shopify to support your field sales B2B orders on behalf of your company customers. {hasManagedCompanies
              ? "Your companies are managed in Shopify Admin. "
              : "Manage your companies here, then assign territories. "}
            Your reps use a dedicated mobile-friendly site to mange their accounts and create orders.
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Quick Stats */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Overview</s-heading>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack gap="base">
              <s-stack gap="none">
                <s-heading>{companiesCount}{companiesCount >= 25 ? '+' : ''}</s-heading>
                <s-text color="subdued">B2B Companies</s-text>
              </s-stack>
              <s-stack gap="none">
                <s-heading>{shop?.isActive ? "Active" : "Setup"}</s-heading>
                <s-text color="subdued">Status</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
