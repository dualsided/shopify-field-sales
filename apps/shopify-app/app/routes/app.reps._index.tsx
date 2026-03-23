import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getSalesReps, type SalesRepListItem } from "../services/salesRep.server";

interface LoaderData {
  reps: SalesRepListItem[];
  shopId: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { reps: [], shopId: null };
  }

  const reps = await getSalesReps(shop.id);

  return {
    reps,
    shopId: shop.id,
  };
};

export default function SalesRepsPage() {
  const { reps, shopId } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter reps based on search query
  const filteredReps = useMemo(() => {
    if (!searchQuery.trim()) return reps;
    const query = searchQuery.toLowerCase();
    return reps.filter(
      (r) =>
        r.firstName.toLowerCase().includes(query) ||
        r.lastName.toLowerCase().includes(query) ||
        r.email.toLowerCase().includes(query)
    );
  }, [reps, searchQuery]);

  if (!shopId) {
    return (
      <s-page heading="Sales Reps">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before managing sales reps.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Sales Reps">
      <s-link slot="secondary-actions" href="/app/reps/create">
        Add Sales Rep
      </s-link>

      <s-box paddingBlock="base">
        <s-paragraph>
          Manage your field sales representatives. Assign territories and track their accounts.
        </s-paragraph>
      </s-box>

      <s-section padding="none" accessibilityLabel="Sales reps list">
        {reps.length === 0 ? (
          <s-box padding="base">
            <s-stack gap="base">
              <s-heading>No sales reps yet</s-heading>
              <s-paragraph>
                Create your first sales rep to start managing your field sales team.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr">
              <s-text-field
                icon="search"
                label="Search sales reps"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search by name or email..."
                autocomplete="off"
                value={searchQuery}
                onInput={(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  setSearchQuery(target.value);
                }}
              />
            </s-grid>

            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Email</s-table-header>
              <s-table-header>Role</s-table-header>
              <s-table-header>Territories</s-table-header>
              <s-table-header>Companies</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {filteredReps.length === 0 ? (
                <s-table-row>
                  <s-table-cell>
                    <s-text color="subdued">No sales reps match your search.</s-text>
                  </s-table-cell>
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                </s-table-row>
              ) : (
                filteredReps.map((rep) => (
                  <s-table-row key={rep.id} clickDelegate={`rep-link-${rep.id}`}>
                    <s-table-cell>
                      <s-link
                        id={`rep-link-${rep.id}`}
                        onClick={() => navigate(`/app/reps/${rep.id}`)}
                      >
                        {rep.firstName} {rep.lastName}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">{rep.email}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {rep.role === "MANAGER" ? (
                        <s-badge tone="info">Manager</s-badge>
                      ) : (
                        <s-badge>Rep</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>{rep.territoryCount}</s-table-cell>
                    <s-table-cell>{rep.companyCount}</s-table-cell>
                    <s-table-cell>
                      {rep.isActive ? (
                        <s-badge tone="success">Active</s-badge>
                      ) : (
                        <s-badge tone="warning">Inactive</s-badge>
                      )}
                    </s-table-cell>
                  </s-table-row>
                ))
              )}
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
