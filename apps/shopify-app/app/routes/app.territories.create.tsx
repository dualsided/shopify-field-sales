import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useCallback, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAuthenticatedShop, getShopOrNull } from "../services/shop.server";
import { getActiveSalesReps } from "../services/salesRep.server";
import { createTerritory, US_STATES } from "../services/territory.server";
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
  shopId: string | null;
  reps: SalesRep[];
  states: readonly StateOption[];
}

interface ActionData {
  success?: boolean;
  territoryId?: string;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await getShopOrNull(request);

  if (!shop) {
    return { shopId: null, reps: [], states: US_STATES };
  }

  const reps = await getActiveSalesReps(shop.id);

  return {
    shopId: shop.id,
    reps,
    states: US_STATES,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await getAuthenticatedShop(request);

  const formData = await request.formData();
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

  const result = await createTerritory({
    shopId: shop.id,
    name,
    description: description || null,
    stateCodes,
    zipcodes,
    repIds,
  });

  if (result.success) {
    return { success: true, territoryId: result.territoryId };
  }
  return { error: result.error };
};

export default function NewTerritoryPage() {
  const { shopId, reps, states } = useLoaderData<LoaderData>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.saveBar.hide("territory-form-save-bar");
      shopify.toast.show("Territory created");
      navigate("/app/territories");
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

  if (!shopId) {
    return (
      <s-page heading="Add Territory">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>Your store needs to complete setup first.</s-paragraph>
            <s-button onClick={() => navigate("/app")}>Back to Dashboard</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Add Territory">
      <s-section>
        <TerritoryForm
          reps={reps}
          states={states}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/app/territories")}
          actionError={fetcher.data?.error}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
