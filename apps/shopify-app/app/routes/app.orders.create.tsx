import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useEffect, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  OrderForm,
  type OrderFormData,
  type ProductSearchResult,
  type ShippingOption,
  type PromotionEvaluationInput,
  type PromotionEvaluationResult,
} from "../components/OrderForm";
import type { Company } from "../components/CompanyPicker";
import type { Contact } from "../components/ContactPicker";
import type { Location } from "../components/LocationPicker";
import { getAuthenticatedShop, getShopOrNull } from "../services/shop.server";
import { getCompanies } from "../services/company.server";
import { getSalesReps } from "../services/salesRep.server";
import { createOrder, type CreateOrderInput } from "../services/order.server";

interface LoaderData {
  shopId: string | null;
  companies: { id: string; name: string; accountNumber: string | null }[];
  salesReps: { id: string; name: string }[];
}

interface ActionData {
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await getShopOrNull(request);

  if (!shop) {
    return { shopId: null, companies: [], salesReps: [] };
  }

  // Get companies and sales reps for selection
  const [companiesResult, salesReps] = await Promise.all([
    getCompanies(shop.id),
    getSalesReps(shop.id),
  ]);

  return {
    shopId: shop.id,
    companies: companiesResult.companies.map((c) => ({
      id: c.id,
      name: c.name,
      accountNumber: c.accountNumber,
    })),
    salesReps: salesReps.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Use redirect from getAuthenticatedShop for embedded app compatibility
  const { shop, redirect } = await getAuthenticatedShop(request);

  const formData = await request.formData();
  const orderDataJson = formData.get("orderData") as string;
  const salesRepId = formData.get("salesRepId") as string;

  if (!orderDataJson) {
    return { error: "No order data provided" };
  }

  const orderData = JSON.parse(orderDataJson) as OrderFormData;

  if (!orderData.company) {
    return { error: "Company is required" };
  }

  if (!salesRepId) {
    return { error: "Sales rep is required" };
  }

  // Build the create order input
  const input: CreateOrderInput = {
    shopId: shop.id,
    companyId: orderData.company.id,
    salesRepId,
    contactId: orderData.contact?.id || null,
    shippingLocationId: orderData.shippingLocation?.id || null,
    billingLocationId: orderData.billingLocation?.id || null,
    note: orderData.note || null,
    poNumber: orderData.poNumber || null,
    paymentTerms: orderData.paymentTerms,
    lineItems: orderData.lineItems.map((item) => ({
      shopifyProductId: item.shopifyProductId,
      shopifyVariantId: item.shopifyVariantId,
      sku: item.sku,
      title: item.title,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };

  const result = await createOrder(input);

  if (result.success) {
    // Use Shopify's redirect for embedded app compatibility
    throw redirect(`/app/orders/${result.orderId}`);
  }

  return { error: result.error };
};

export default function CreateOrderPage() {
  const { shopId, salesReps } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const isSubmitting = fetcher.state !== "idle";

  // Default to first sales rep (in a real app, this would be the logged-in user)
  const defaultSalesRepId = salesReps[0]?.id;

  useEffect(() => {
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!shopId) {
    return (
      <s-page heading="Create Order">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>Your store needs to complete setup before creating orders.</s-paragraph>
            <s-button onClick={() => navigate("/app")}>Go to Dashboard</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (!defaultSalesRepId) {
    return (
      <s-page heading="Create Order">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>No sales reps found. Please add a sales rep first.</s-paragraph>
            <s-button onClick={() => navigate("/app/reps")}>Manage Sales Reps</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const handleSave = (data: OrderFormData) => {
    fetcher.submit(
      {
        orderData: JSON.stringify(data),
        salesRepId: defaultSalesRepId,
      },
      { method: "POST" }
    );
  };

  const handleCancel = () => {
    navigate("/app/orders");
  };

  const handleLoadProducts = useCallback(async (): Promise<ProductSearchResult[]> => {
    const response = await fetch("/api/products");
    const data = await response.json();
    return data.products || [];
  }, []);

  const handleSearchProducts = useCallback(async (query: string): Promise<ProductSearchResult[]> => {
    const response = await fetch(`/api/products?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.products || [];
  }, []);

  const handleLoadShippingOptions = useCallback(async (): Promise<ShippingOption[]> => {
    const response = await fetch("/api/shipping-methods");
    const data = await response.json();
    return (data.shippingMethods || []).map((sm: { id: string; title: string; priceCents: number }) => ({
      id: sm.id,
      name: sm.title,
      priceCents: sm.priceCents,
    }));
  }, []);

  const handleLoadCompanies = useCallback(async (): Promise<Company[]> => {
    const response = await fetch("/api/companies");
    const data = await response.json();
    return (data.companies || []).map((c: { id: string; name: string; accountNumber?: string; territory?: { id: string; name: string } }) => ({
      id: c.id,
      name: c.name,
      accountNumber: c.accountNumber,
      territoryId: c.territory?.id,
      territoryName: c.territory?.name,
    }));
  }, []);

  const handleLoadContacts = useCallback(async (): Promise<Contact[]> => {
    const response = await fetch("/api/contacts");
    const data = await response.json();
    return (data.contacts || []).map((c: { id: string; companyId: string; firstName: string; lastName: string; email: string; phone?: string; title?: string; isPrimary?: boolean }) => ({
      id: c.id,
      companyId: c.companyId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      title: c.title,
      isPrimary: c.isPrimary,
    }));
  }, []);

  const handleLoadLocations = useCallback(async (): Promise<Location[]> => {
    const response = await fetch("/api/locations");
    const data = await response.json();
    return (data.locations || []).map((l: { id: string; companyId: string; name: string; address1?: string; address2?: string; city?: string; province?: string; provinceCode?: string; zipcode?: string; country?: string; phone?: string; isPrimary?: boolean; isShippingAddress?: boolean; isBillingAddress?: boolean }) => ({
      id: l.id,
      companyId: l.companyId,
      name: l.name,
      address1: l.address1,
      address2: l.address2,
      city: l.city,
      province: l.province,
      provinceCode: l.provinceCode,
      zipcode: l.zipcode,
      country: l.country,
      phone: l.phone,
      isPrimary: l.isPrimary,
      isShippingAddress: l.isShippingAddress,
      isBillingAddress: l.isBillingAddress,
    }));
  }, []);

  const handleEvaluatePromotions = useCallback(async (input: PromotionEvaluationInput): Promise<PromotionEvaluationResult> => {
    const response = await fetch("/api/promotions/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!data.success) {
      console.error("Promotion evaluation failed:", data.error);
      return { appliedPromotions: [], freeItemsToAdd: [], totalDiscountCents: 0 };
    }
    return {
      appliedPromotions: data.appliedPromotions,
      freeItemsToAdd: data.freeItemsToAdd,
      totalDiscountCents: data.totalDiscountCents,
    };
  }, []);

  return (
    <OrderForm
      mode="create"
      onSave={handleSave}
      onCancel={handleCancel}
      onLoadProducts={handleLoadProducts}
      onSearchProducts={handleSearchProducts}
      onLoadShippingOptions={handleLoadShippingOptions}
      onLoadCompanies={handleLoadCompanies}
      onLoadContacts={handleLoadContacts}
      onLoadLocations={handleLoadLocations}
      onEvaluatePromotions={handleEvaluatePromotions}
      isSubmitting={isSubmitting}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
