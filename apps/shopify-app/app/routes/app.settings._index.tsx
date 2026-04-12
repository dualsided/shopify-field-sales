import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
import { getAuthenticatedShop } from "../services/shop.server";
import { ShippingMethodModal, SHIPPING_MODAL_ID } from "../components/ShippingMethodModal";
import { PromotionModal, PROMOTION_MODAL_ID } from "../components/PromotionModal";
import { ImagePicker } from "../components/ImagePicker";
import type { Product } from "../components/ProductPicker";
import {
  getShippingMethods,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  type ShippingMethod,
} from "../services/shippingMethod.server";
import { prisma } from "@field-sales/database";
import {
  getPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotionActive,
  type Promotion,
} from "../services/promotion.server";
import type { PromotionType } from "@field-sales/database";

interface LoaderData {
  shopId: string;
  logoUrl: string | null;
  accentColor: string | null;
  orderPrefix: string;
  orderNumberStart: number;
  shippingMethods: ShippingMethod[];
  promotions: Promotion[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await getAuthenticatedShop(request);

  const [shippingMethods, promotions] = await Promise.all([
    getShippingMethods(shop.id),
    getPromotions(shop.id),
  ]);

  return {
    shopId: shop.id,
    logoUrl: shop.logoUrl,
    accentColor: shop.accentColor,
    orderPrefix: shop.orderPrefix,
    orderNumberStart: shop.orderNumberStart,
    shippingMethods,
    promotions,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await getAuthenticatedShop(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // Shipping Method actions
    if (intent === "createShippingMethod") {
      const title = formData.get("title") as string;
      const method = formData.get("method") as string;
      const priceCents = Math.round(parseFloat(formData.get("price") as string) * 100);

      await createShippingMethod({
        shopId: shop.id,
        title,
        method,
        priceCents,
      });
      return { success: true, message: "Shipping method created" };
    }

    if (intent === "updateShippingMethod") {
      const id = formData.get("id") as string;
      const title = formData.get("title") as string;
      const method = formData.get("method") as string;
      const priceCents = Math.round(parseFloat(formData.get("price") as string) * 100);

      await updateShippingMethod(id, { title, method, priceCents });
      return { success: true, message: "Shipping method updated" };
    }

    if (intent === "deleteShippingMethod") {
      const id = formData.get("id") as string;
      await deleteShippingMethod(id);
      return { success: true, message: "Shipping method deleted" };
    }

    // Order settings actions
    if (intent === "updateOrderSettings") {
      const orderPrefix = (formData.get("orderPrefix") as string)?.trim() || "FS";
      const orderNumberStart = parseInt(formData.get("orderNumberStart") as string, 10) || 1;

      await prisma.shop.update({
        where: { id: shop.id },
        data: { orderPrefix, orderNumberStart },
      });
      return { success: true, message: "Order settings saved" };
    }

    // Branding settings actions
    if (intent === "updateBrandingSettings") {
      const logoUrl = formData.get("logoUrl") as string | null;
      const accentColor = formData.get("accentColor") as string | null;

      await prisma.shop.update({
        where: { id: shop.id },
        data: {
          logoUrl: logoUrl || null,
          accentColor: accentColor || null,
        },
      });
      return { success: true, message: "Branding settings saved" };
    }

    // Promotion actions
    if (intent === "createPromotion") {
      const name = formData.get("name") as string;
      const description = formData.get("description") as string | null;
      const type = formData.get("type") as PromotionType;
      // For free item promotions, value is always 100 (100% off)
      const value = (type === "BUY_X_GET_Y" || type === "SPEND_GET_FREE")
        ? 100
        : parseFloat(formData.get("value") as string);
      const minOrderCents = formData.get("minOrderCents")
        ? Math.round(parseFloat(formData.get("minOrderCents") as string) * 100)
        : undefined;
      const buyQuantity = formData.get("buyQuantity")
        ? parseInt(formData.get("buyQuantity") as string, 10)
        : undefined;
      const getQuantity = formData.get("getQuantity")
        ? parseInt(formData.get("getQuantity") as string, 10)
        : undefined;
      const buyProductIdsStr = formData.get("buyProductIds") as string;
      const buyProductIds = buyProductIdsStr ? JSON.parse(buyProductIdsStr) as string[] : undefined;
      const getProductIdsStr = formData.get("getProductIds") as string;
      const getProductIds = getProductIdsStr ? JSON.parse(getProductIdsStr) as string[] : undefined;
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAtStr = formData.get("endsAt") as string;
      const endsAt = endsAtStr ? new Date(endsAtStr) : undefined;

      await createPromotion({
        shopId: shop.id,
        name,
        description: description || undefined,
        type,
        value,
        minOrderCents,
        buyQuantity,
        buyProductIds,
        getQuantity,
        getProductIds,
        startsAt,
        endsAt,
      });
      return { success: true, message: "Promotion created" };
    }

    if (intent === "updatePromotion") {
      const id = formData.get("id") as string;
      const name = formData.get("name") as string;
      const description = formData.get("description") as string | null;
      const type = formData.get("type") as PromotionType;
      // For free item promotions, value is always 100 (100% off)
      const value = (type === "BUY_X_GET_Y" || type === "SPEND_GET_FREE")
        ? 100
        : parseFloat(formData.get("value") as string);
      const minOrderCents = formData.get("minOrderCents")
        ? Math.round(parseFloat(formData.get("minOrderCents") as string) * 100)
        : undefined;
      const buyQuantity = formData.get("buyQuantity")
        ? parseInt(formData.get("buyQuantity") as string, 10)
        : undefined;
      const getQuantity = formData.get("getQuantity")
        ? parseInt(formData.get("getQuantity") as string, 10)
        : undefined;
      const buyProductIdsStr = formData.get("buyProductIds") as string;
      const buyProductIds = buyProductIdsStr ? JSON.parse(buyProductIdsStr) as string[] : undefined;
      const getProductIdsStr = formData.get("getProductIds") as string;
      const getProductIds = getProductIdsStr ? JSON.parse(getProductIdsStr) as string[] : undefined;
      const startsAt = new Date(formData.get("startsAt") as string);
      const endsAtStr = formData.get("endsAt") as string;
      const endsAt = endsAtStr ? new Date(endsAtStr) : null;

      await updatePromotion(id, {
        name,
        description: description || undefined,
        type,
        value,
        minOrderCents,
        buyQuantity,
        buyProductIds,
        getQuantity,
        getProductIds,
        startsAt,
        endsAt,
      });
      return { success: true, message: "Promotion updated" };
    }

    if (intent === "deletePromotion") {
      const id = formData.get("id") as string;
      await deletePromotion(id);
      return { success: true, message: "Promotion deleted" };
    }

    if (intent === "togglePromotionActive") {
      const id = formData.get("id") as string;
      await togglePromotionActive(id);
      return { success: true, message: "Promotion status updated" };
    }

    return { success: false, error: "Unknown action" };
  } catch (error) {
    console.error("Settings action error:", error);
    return { success: false, error: "An error occurred" };
  }
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SettingsPage() {
  const { shippingMethods, promotions, orderPrefix, orderNumberStart, logoUrl, accentColor } = useLoaderData<LoaderData>();
  const shopify = useAppBridge();
  const fetcher = useFetcher();

  const [editingShipping, setEditingShipping] = useState<ShippingMethod | undefined>();
  const [editingPromotion, setEditingPromotion] = useState<Promotion | undefined>();

  // Branding settings - track both current and saved values
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [savedLogo, setSavedLogo] = useState<string | null>(logoUrl);
  const [accent, setAccent] = useState<string>(accentColor || "#4F46E5");
  const [savedAccent, setSavedAccent] = useState<string>(accentColor || "#4F46E5");

  // Order settings - track both current and saved values
  const [prefix, setPrefix] = useState(orderPrefix);
  const [startNumber, setStartNumber] = useState(orderNumberStart.toString());
  const [savedPrefix, setSavedPrefix] = useState(orderPrefix);
  const [savedStartNumber, setSavedStartNumber] = useState(orderNumberStart.toString());

  // Track if branding settings are dirty
  const isBrandingDirty = logo !== savedLogo || accent !== savedAccent;

  // Track if order settings are dirty
  const isOrderSettingsDirty = prefix !== savedPrefix || startNumber !== savedStartNumber;

  // Show/hide SaveBar based on dirty state
  useEffect(() => {
    if (isOrderSettingsDirty || isBrandingDirty) {
      shopify.saveBar.show("settings-save-bar");
    } else {
      shopify.saveBar.hide("settings-save-bar");
    }
  }, [isOrderSettingsDirty, isBrandingDirty, shopify]);

  const handleSaveSettings = useCallback(() => {
    // Save order settings if dirty
    if (isOrderSettingsDirty) {
      fetcher.submit(
        { intent: "updateOrderSettings", orderPrefix: prefix, orderNumberStart: startNumber },
        { method: "post" }
      );
    }
    // Save branding settings if dirty
    if (isBrandingDirty) {
      fetcher.submit(
        { intent: "updateBrandingSettings", logoUrl: logo || "", accentColor: accent },
        { method: "post" }
      );
    }
  }, [fetcher, prefix, startNumber, logo, accent, isOrderSettingsDirty, isBrandingDirty]);

  const handleDiscardSettings = useCallback(() => {
    setPrefix(savedPrefix);
    setStartNumber(savedStartNumber);
    setLogo(savedLogo);
    setAccent(savedAccent);
  }, [savedPrefix, savedStartNumber, savedLogo, savedAccent]);

  // Track if we've processed the current fetcher result
  const lastProcessedData = useRef<unknown>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.message && fetcher.data !== lastProcessedData.current) {
      lastProcessedData.current = fetcher.data;
      shopify.toast.show(fetcher.data.message);
      // If order settings saved successfully, update saved values
      if (fetcher.data.success && fetcher.data.message === "Order settings saved") {
        setSavedPrefix(prefix);
        setSavedStartNumber(startNumber);
      }
      // If branding settings saved successfully, update saved values
      if (fetcher.data.success && fetcher.data.message === "Branding settings saved") {
        setSavedLogo(logo);
        setSavedAccent(accent);
      }
    }
  }, [fetcher.state, fetcher.data, shopify, prefix, startNumber, logo, accent]);

  // Load products for the product picker
  const loadProducts = useCallback(async (): Promise<Product[]> => {
    const response = await fetch("/api/products");
    const data = await response.json();
    return data.products.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      shopifyProductId: p.shopifyProductId as string,
      shopifyVariantId: p.shopifyVariantId as string,
      title: p.title as string,
      variantTitle: p.variantTitle as string | undefined,
      sku: p.sku as string | undefined,
      priceCents: p.priceCents as number,
      imageUrl: p.imageUrl as string | undefined,
    }));
  }, []);

  const handleEditShipping = (method: ShippingMethod) => {
    setEditingShipping(method);
    const modalEl = document.getElementById(SHIPPING_MODAL_ID) as HTMLElement & { showOverlay: () => void };
    modalEl?.showOverlay();
  };

  const handleCloseShippingModal = () => {
    setEditingShipping(undefined);
  };

  const handleDeleteShipping = (id: string) => {
    if (confirm("Are you sure you want to delete this shipping method?")) {
      fetcher.submit({ intent: "deleteShippingMethod", id }, { method: "post" });
    }
  };

  const handleEditPromotion = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    const modalEl = document.getElementById(PROMOTION_MODAL_ID) as HTMLElement & { showOverlay: () => void };
    modalEl?.showOverlay();
  };

  const handleClosePromotionModal = () => {
    setEditingPromotion(undefined);
  };

  const handleDeletePromotion = (id: string) => {
    if (confirm("Are you sure you want to delete this promotion?")) {
      fetcher.submit({ intent: "deletePromotion", id }, { method: "post" });
    }
  };

  const handleTogglePromotion = (id: string) => {
    fetcher.submit({ intent: "togglePromotionActive", id }, { method: "post" });
  };

  const getPromotionTypeLabel = (type: PromotionType): string => {
    switch (type) {
      case "PERCENTAGE":
        return "Percentage Off";
      case "FIXED_AMOUNT":
        return "Fixed Amount Off";
      case "BUY_X_GET_Y":
        return "Buy X Get Y";
      case "SPEND_GET_FREE":
        return "Spend & Get Free";
      default:
        return type;
    }
  };

  const getPromotionDescription = (promo: Promotion): string => {
    switch (promo.type) {
      case "PERCENTAGE":
        return `Spend ${formatCurrency(promo.minOrderCents || 0)}, get ${promo.value}% off`;
      case "FIXED_AMOUNT":
        return `Spend ${formatCurrency(promo.minOrderCents || 0)}, get ${formatCurrency(Number(promo.value) * 100)} off`;
      case "BUY_X_GET_Y":
        return `Buy ${promo.buyQuantity}, get ${promo.getQuantity} free`;
      case "SPEND_GET_FREE":
        return `Spend ${formatCurrency(promo.minOrderCents || 0)}, get ${promo.getQuantity} free`;
      default:
        return "";
    }
  };

  return (
    <s-page heading="Settings">
      <s-link href="/app/settings/products" slot="secondary-actions">Products</s-link>

      {/* Modals */}
      <ShippingMethodModal editingMethod={editingShipping} onClose={handleCloseShippingModal} />
      <PromotionModal editingPromotion={editingPromotion} onClose={handleClosePromotionModal} onLoadProducts={loadProducts} />

      {/* SaveBar for Settings */}
      <SaveBar id="settings-save-bar">
        <button variant="primary" onClick={handleSaveSettings}></button>
        <button onClick={handleDiscardSettings}></button>
      </SaveBar>

      {/* Branding Section */}
      <s-section>
        <s-stack gap="large">
          <s-stack gap="small-200">
            <s-heading>Branding</s-heading>
            <s-text color="subdued">
              Customize the appearance of your Field Sales mobile app.
            </s-text>
          </s-stack>

          <s-grid gridTemplateColumns="1fr 1fr" gap="large">
            <ImagePicker
              value={logo}
              onChange={setLogo}
              label="Store Logo"
              helpText="Displayed in the app header. Recommended: 400x100px"
            />

            <s-stack gap="small-200">
              <s-text variant="bodyMd" fontWeight="semibold">Accent Color</s-text>
              <s-text color="subdued">Used for buttons and interactive elements</s-text>
              <s-stack direction="inline" gap="base" alignItems="center">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  style={{
                    width: "48px",
                    height: "48px",
                    padding: "0",
                    border: "1px solid var(--p-color-border)",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                />
                <s-text-field
                  label=""
                  value={accent}
                  onInput={(e: Event) => setAccent((e.target as HTMLInputElement).value)}
                  placeholder="#4F46E5"
                  style={{ width: "120px" }}
                />
              </s-stack>
            </s-stack>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Order Settings Section */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Order Settings</s-heading>
          <s-text color="subdued">
            Configure order number format. Orders will be numbered as PREFIX-NUMBER (e.g., FS-1001).
          </s-text>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-text-field
              label="Order Prefix"
              value={prefix}
              onInput={(e: Event) => setPrefix((e.target as HTMLInputElement).value)}
              placeholder="FS"
            />
            <s-number-field
              label="Starting Number"
              value={startNumber}
              min={1000}
              onInput={(e: Event) => setStartNumber((e.target as HTMLInputElement).value)}
              placeholder="1000"
            />
          </s-grid>
        </s-stack>
      </s-section>

      {/* Shipping Methods Section */}
      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200" justifyContent="space-between" alignItems="center">
            <s-heading>Shipping Methods</s-heading>
            <s-button variant="secondary" commandFor={SHIPPING_MODAL_ID} command="--show">
              Add Shipping Method
            </s-button>
          </s-stack>

          {shippingMethods.length > 0 ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>Title</s-table-header>
                <s-table-header>Method</s-table-header>
                <s-table-header>Price</s-table-header>
                <s-table-header></s-table-header>
              </s-table-header-row>
              <s-table-body>
                {shippingMethods.map((method) => (
                  <s-table-row key={method.id}>
                    <s-table-cell>{method.title}</s-table-cell>
                    <s-table-cell>{method.method}</s-table-cell>
                    <s-table-cell>{formatCurrency(method.priceCents)}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <s-button
                          variant="tertiary"
                          icon="edit"
                          accessibilityLabel="Edit"
                          onClick={() => handleEditShipping(method)}
                        />
                        <s-button
                          variant="tertiary"
                          icon="delete"
                          accessibilityLabel="Delete"
                          onClick={() => handleDeleteShipping(method.id)}
                        />
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-box padding="large">
              <s-text color="subdued">No shipping methods configured. Add one to get started.</s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

        {/* Promotions Section */}
        <s-section>
          <s-stack gap="base">
            <s-stack direction="inline" gap="small-200" justifyContent="space-between" alignItems="center">
              <s-heading>Promotions</s-heading>
              <s-button variant="secondary" commandFor={PROMOTION_MODAL_ID} command="--show">
                Add Promotion
              </s-button>
            </s-stack>

            {promotions.length > 0 ? (
              <s-table>
                <s-table-header-row>
                  <s-table-header>Name</s-table-header>
                  <s-table-header>Type</s-table-header>
                  <s-table-header>Details</s-table-header>
                  <s-table-header>Dates</s-table-header>
                  <s-table-header>Status</s-table-header>
                  <s-table-header></s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {promotions.map((promo) => (
                    <s-table-row key={promo.id}>
                      <s-table-cell>
                        <s-stack gap="none">
                          <s-text>{promo.name}</s-text>
                          {promo.description && (
                            <s-text color="subdued">{promo.description}</s-text>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge>{getPromotionTypeLabel(promo.type)}</s-badge>
                      </s-table-cell>
                      <s-table-cell>{getPromotionDescription(promo)}</s-table-cell>
                      <s-table-cell>
                        <s-stack gap="none">
                          <s-text>From: {formatDate(promo.startsAt)}</s-text>
                          {promo.endsAt && (
                            <s-text color="subdued">To: {formatDate(promo.endsAt)}</s-text>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          variant="tertiary"
                          onClick={() => handleTogglePromotion(promo.id)}
                        >
                          {promo.isActive ? (
                            <s-badge tone="success">Active</s-badge>
                          ) : (
                            <s-badge>Inactive</s-badge>
                          )}
                        </s-button>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small-200">
                          <s-button
                            variant="tertiary"
                            icon="edit"
                            accessibilityLabel="Edit"
                            onClick={() => handleEditPromotion(promo)}
                          />
                          <s-button
                            variant="tertiary"
                            icon="delete"
                            accessibilityLabel="Delete"
                            onClick={() => handleDeletePromotion(promo.id)}
                          />
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            ) : (
              <s-box padding="large">
                <s-text color="subdued">No promotions configured. Add one to get started.</s-text>
              </s-box>
            )}
          </s-stack>
        </s-section>
    </s-page>
  );
}
