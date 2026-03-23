import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getCompanies, importCompaniesFromShopify, type CompanyListItem } from "../services/company.server";

interface LoaderData {
  companies: CompanyListItem[];
  shopId: string | null;
  hasManagedCompanies: boolean;
}

interface ActionData {
  success?: boolean;
  imported?: number;
  updated?: number;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { companies: [], shopId: null, hasManagedCompanies: false };
  }

  const companies = await getCompanies(shop.id);

  return {
    companies,
    shopId: shop.id,
    hasManagedCompanies: shop.hasManagedCompanies,
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
  const actionType = formData.get("_action");

  if (actionType === "import") {
    const result = await importCompaniesFromShopify(shop.id, admin);
    return result;
  }

  return { success: false, error: "Unknown action" };
};

export default function CompaniesPage() {
  const { companies, shopId, hasManagedCompanies } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const isImporting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      const { imported = 0, updated = 0 } = fetcher.data;
      shopify.toast.show(`Imported ${imported} new companies, updated ${updated} existing`);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!shopId) {
    return (
      <s-page heading="Companies">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before managing companies.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const handleImport = () => {
    fetcher.submit({ _action: "import" }, { method: "POST" });
  };

  return (
    <s-page heading="Companies">
      <s-button slot="secondary-actions" onClick={handleImport} disabled={isImporting}>
        {isImporting ? "Importing..." : "Import from Shopify"}
      </s-button>
      <s-link slot="secondary-actions" href={hasManagedCompanies ? "shopify://admin/companies/new" : "/app/companies/create"}>
        Add Company
      </s-link>
      <s-section>
        <s-stack gap="base">
          <s-paragraph>
            {hasManagedCompanies
              ? "View and manage your B2B companies. Companies are synced from Shopify Admin."
              : "Manage your B2B companies. Add contacts and locations, then assign territories."}
          </s-paragraph>

        </s-stack>
      </s-section>

      <s-section padding="none">
        {companies.length === 0 ? (
          <s-box padding="base">
            <s-stack gap="base">
              <s-heading>No companies yet</s-heading>
              <s-paragraph>
                {hasManagedCompanies
                  ? "Companies will appear here once synced from Shopify."
                  : "Create your first company to start managing B2B customers."}
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header>
              <s-table-row>
                <s-table-cell>Company</s-table-cell>
                <s-table-cell>Account #</s-table-cell>
                <s-table-cell>Locations</s-table-cell>
                <s-table-cell>Contacts</s-table-cell>
                <s-table-cell>Type</s-table-cell>
              </s-table-row>
            </s-table-header>
            <s-table-body>
              {companies.map((company) => (
                <s-table-row key={company.id}>
                  <s-table-cell>
                    <s-button variant="tertiary" onClick={() => navigate(`/app/companies/${company.id}`)}>
                      {company.name}
                    </s-button>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{company.accountNumber || "—"}</s-text>
                  </s-table-cell>
                  <s-table-cell>{company.locationCount}</s-table-cell>
                  <s-table-cell>{company.contactCount}</s-table-cell>
                  <s-table-cell>
                    {company.isShopifyManaged ? (
                      <s-badge tone="info">Shopify</s-badge>
                    ) : (
                      <s-badge>Internal</s-badge>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
