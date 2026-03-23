import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher, Form } from "react-router";
import { useCallback, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAuthenticatedShop, getShopOrNull } from "../services/shop.server";
import {
  getTerritoryById,
  updateTerritory,
  deactivateTerritory,
  activateTerritory,
  US_STATES,
  type TerritoryDetail,
} from "../services/territory.server";
import { getActiveSalesReps } from "../services/salesRep.server";
import { TerritoryForm, type TerritoryFormData } from "../components/TerritoryForm";

interface SalesRep {
  id: string;
  name: string;
}

interface StateOption {
  code: string;
  name: string;
}

interface LoaderData {
  territory: TerritoryDetail | null;
  allReps: SalesRep[];
  states: readonly StateOption[];
  shopId: string | null;
}

interface ActionData {
  success?: boolean;
  error?: string;
  deleted?: boolean;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop } = await getShopOrNull(request);
  const territoryId = params.id;

  if (!shop || !territoryId) {
    return { territory: null, allReps: [], states: US_STATES, shopId: null };
  }

  const [territory, allReps] = await Promise.all([
    getTerritoryById(shop.id, territoryId),
    getActiveSalesReps(shop.id),
  ]);

  return {
    territory,
    allReps,
    states: US_STATES,
    shopId: shop.id,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = await getAuthenticatedShop(request);
  const territoryId = params.id;

  if (!territoryId) {
    return { error: "Invalid request" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string | null;

  // Handle deactivate/activate actions
  if (actionType === "delete") {
    const result = await deactivateTerritory(shop.id, territoryId);
    if (result.success) return { deleted: true };
    return { error: result.error };
  }

  if (actionType === "activate") {
    const result = await activateTerritory(shop.id, territoryId);
    if (result.success) return { success: true };
    return { error: result.error };
  }

  // Handle form update
  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;
  const stateCodesStr = formData.get("stateCodes") as string | null;
  const zipcodesStr = formData.get("zipcodes") as string | null;
  const repIdsStr = formData.get("repIds") as string | null;

  const stateCodes = stateCodesStr ? JSON.parse(stateCodesStr) : [];
  const zipcodes = zipcodesStr ? JSON.parse(zipcodesStr) : [];
  const repIds = repIdsStr ? JSON.parse(repIdsStr) : [];

  if (!name) {
    return { error: "Territory name is required" };
  }

  const result = await updateTerritory(shop.id, territoryId, {
    name,
    description: description || null,
    stateCodes,
    zipcodes,
    repIds,
  });

  if (result.success) return { success: true };
  return { error: result.error };
};

export default function TerritoryDetailPage() {
  const { territory, allReps, states, shopId } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher<ActionData>();

  useEffect(() => {
    if (fetcher.data?.deleted) {
      shopify.toast.show("Territory deactivated");
      navigate("/app/territories");
    }
    if (fetcher.data?.success) {
      shopify.saveBar.hide("territory-form-save-bar");
      shopify.toast.show("Territory updated");
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  const handleSubmit = useCallback((data: TerritoryFormData) => {
    fetcher.submit(
      {
        name: data.name,
        description: data.description || "",
        stateCodes: JSON.stringify(data.stateCodes),
        zipcodes: JSON.stringify(data.zipcodes),
        repIds: JSON.stringify(data.repIds),
      },
      { method: "POST" }
    );
  }, [fetcher]);

  if (!shopId || !territory) {
    return (
      <s-page heading="Territory Not Found">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>This territory was not found or you don't have access.</s-paragraph>
            <s-button onClick={() => navigate("/app/territories")}>Back to Territories</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={territory.name}>
      <s-link slot="breadcrumb-actions" href="/app/territories">
        Territories
      </s-link>

      {!territory.isActive && (
        <s-section>
          <s-banner tone="warning">
            This territory is inactive. Companies in this territory will not be accessible by reps.
          </s-banner>
        </s-section>
      )}

      <s-section>
        <TerritoryForm
          territory={territory}
          reps={allReps}
          states={states}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/app/territories")}
          actionError={fetcher.data?.error}
        />
      </s-section>

      <s-section>
        <s-stack gap="base">
          <s-heading>Assigned Sales Reps ({territory.reps.length})</s-heading>
          <s-paragraph>Reps who can access companies in this territory.</s-paragraph>

          {territory.reps.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-paragraph>No sales reps assigned.</s-paragraph>
            </s-box>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Name</s-table-header>
                <s-table-header>Primary</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {territory.reps.map((rep) => (
                  <s-table-row key={rep.id} clickDelegate={`rep-link-${rep.id}`}>
                    <s-table-cell>
                      <s-link
                        id={`rep-link-${rep.id}`}
                        onClick={() => navigate(`/app/reps/${rep.id}`)}
                      >
                        {rep.name}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      {rep.isPrimary && <s-badge tone="info">Primary</s-badge>}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>

      <s-section>
        <s-stack gap="base">
          <s-heading>Locations ({territory.locations.length})</s-heading>
          <s-paragraph>Company locations assigned to this territory.</s-paragraph>

          {territory.locations.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-paragraph>No locations in this territory.</s-paragraph>
            </s-box>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Location</s-table-header>
                <s-table-header>Company</s-table-header>
                <s-table-header>Account #</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {territory.locations.map((location) => (
                  <s-table-row key={location.id} clickDelegate={`company-link-${location.companyId}`}>
                    <s-table-cell>
                      <s-text>{location.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-link
                        id={`company-link-${location.companyId}`}
                        onClick={() => navigate(`/app/companies/${location.companyId}`)}
                      >
                        {location.companyName}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">{location.accountNumber || "—"}</s-text>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>

      <s-section>
        <s-stack gap="base">
          <s-heading>Danger Zone</s-heading>
          {territory.isActive ? (
            <Form method="post">
              <input type="hidden" name="_action" value="delete" />
              <s-button variant="primary" type="submit">
                Deactivate Territory
              </s-button>
            </Form>
          ) : (
            <Form method="post">
              <input type="hidden" name="_action" value="activate" />
              <s-button type="submit">Reactivate Territory</s-button>
            </Form>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
