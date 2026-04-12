import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { Promotion, PromotionType } from "@field-sales/database";
import { ProductPicker, type Product } from "./ProductPicker";

export const PROMOTION_MODAL_ID = "promotion-modal";

function formatDateForInput(date: Date | string | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

// Parse YYYY-MM-DD string as local date (not UTC) for display
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

interface PromotionModalProps {
  editingPromotion?: Promotion;
  onClose: () => void;
  onLoadProducts?: () => Promise<Product[]>;
}

// Generate auto title based on promotion settings
function generateAutoTitle(
  type: PromotionType,
  minOrderCents: string,
  value: string,
  buyQuantity: string,
  getQuantity: string,
  getProductTitle?: string
): string {
  const minOrder = parseFloat(minOrderCents) || 0;
  const discountValue = parseFloat(value) || 0;
  const buyQty = parseInt(buyQuantity) || 0;
  const getQty = parseInt(getQuantity) || 0;
  const productName = getProductTitle || "";

  switch (type) {
    case "PERCENTAGE":
      if (minOrder > 0 && discountValue > 0) {
        return `Spend $${minOrder.toFixed(0)}, Get ${discountValue}% Off`;
      }
      return discountValue > 0 ? `${discountValue}% Off` : "";
    case "FIXED_AMOUNT":
      if (minOrder > 0 && discountValue > 0) {
        return `Spend $${minOrder.toFixed(0)}, Get $${discountValue.toFixed(0)} Off`;
      }
      return discountValue > 0 ? `$${discountValue.toFixed(0)} Off` : "";
    case "BUY_X_GET_Y":
      if (buyQty > 0 && getQty > 0) {
        return productName
          ? `Buy ${buyQty}, Get ${getQty} ${productName} Free`
          : `Buy ${buyQty}, Get ${getQty} Free`;
      }
      return "";
    case "SPEND_GET_FREE":
      if (minOrder > 0 && getQty > 0) {
        return productName
          ? `Spend $${minOrder.toFixed(0)}, Get ${getQty} ${productName} Free`
          : `Spend $${minOrder.toFixed(0)}, Get ${getQty} Free`;
      }
      return "";
    default:
      return "";
  }
}

export function PromotionModal({ editingPromotion, onClose, onLoadProducts }: PromotionModalProps) {
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!editingPromotion;
  const [type, setType] = useState<PromotionType>(editingPromotion?.type || "PERCENTAGE");

  // Selected products state
  const [buyProducts, setBuyProducts] = useState<Product[]>([]);
  const [getProducts, setGetProducts] = useState<Product[]>([]);

  // Date range state
  const [startDate, setStartDate] = useState(formatDateForInput(editingPromotion?.startsAt || new Date()));
  const [endDate, setEndDate] = useState(formatDateForInput(editingPromotion?.endsAt || null));

  // Form field values for auto-title generation
  const [minOrderCents, setMinOrderCents] = useState(
    editingPromotion?.minOrderCents ? (editingPromotion.minOrderCents / 100).toString() : ""
  );
  const [value, setValue] = useState(editingPromotion?.value?.toString() || "");
  const [buyQuantity, setBuyQuantity] = useState(editingPromotion?.buyQuantity?.toString() || "1");
  const [getQuantity, setGetQuantity] = useState(editingPromotion?.getQuantity?.toString() || "1");
  const [name, setName] = useState(editingPromotion?.name || "");
  const [description, setDescription] = useState(editingPromotion?.description || "");

  // Auto-generate title
  const autoTitle = generateAutoTitle(type, minOrderCents, value, buyQuantity, getQuantity, getProducts[0]?.title);

  // Update state when editing promotion changes
  useEffect(() => {
    setType(editingPromotion?.type || "PERCENTAGE");
    setStartDate(formatDateForInput(editingPromotion?.startsAt || new Date()));
    setEndDate(formatDateForInput(editingPromotion?.endsAt || null));
    setMinOrderCents(editingPromotion?.minOrderCents ? (editingPromotion.minOrderCents / 100).toString() : "");
    setValue(editingPromotion?.value?.toString() || "");
    setBuyQuantity(editingPromotion?.buyQuantity?.toString() || "1");
    setGetQuantity(editingPromotion?.getQuantity?.toString() || "1");
    setName(editingPromotion?.name || "");
    setDescription(editingPromotion?.description || "");

    // Load existing product selections when editing (match by shopifyVariantId for variant-level)
    if (editingPromotion && onLoadProducts) {
      const buyIds = editingPromotion.buyProductIds || [];
      const getIds = editingPromotion.getProductIds || [];

      if (buyIds.length > 0 || getIds.length > 0) {
        onLoadProducts().then((products) => {
          if (buyIds.length > 0) {
            // Try matching by variantId first, then fall back to productId for legacy data
            let matchedBuyProducts = products.filter((p) => buyIds.includes(p.shopifyVariantId));
            if (matchedBuyProducts.length === 0) {
              matchedBuyProducts = products.filter((p) => buyIds.includes(p.shopifyProductId));
            }
            // Deduplicate by variantId
            const uniqueBuy = [...new Map(matchedBuyProducts.map(p => [p.shopifyVariantId, p])).values()];
            setBuyProducts(uniqueBuy);
          } else {
            setBuyProducts([]);
          }

          if (getIds.length > 0) {
            // Try matching by variantId first, then fall back to productId for legacy data
            let matchedGetProducts = products.filter((p) => getIds.includes(p.shopifyVariantId));
            if (matchedGetProducts.length === 0) {
              matchedGetProducts = products.filter((p) => getIds.includes(p.shopifyProductId));
            }
            // Deduplicate by variantId
            const uniqueGet = [...new Map(matchedGetProducts.map(p => [p.shopifyVariantId, p])).values()];
            setGetProducts(uniqueGet);
          } else {
            setGetProducts([]);
          }
        });
      } else {
        setBuyProducts([]);
        setGetProducts([]);
      }
    } else {
      setBuyProducts([]);
      setGetProducts([]);
    }
  }, [editingPromotion, onLoadProducts]);

  // Close modal and show toast on successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      const modalEl = document.getElementById(PROMOTION_MODAL_ID) as HTMLElement & { hideOverlay: () => void };
      modalEl?.hideOverlay();
      formRef.current?.reset();
      setBuyProducts([]);
      setGetProducts([]);
      if (fetcher.data.message) {
        shopify.toast.show(fetcher.data.message);
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  // Handle modal hide event to clear state
  useEffect(() => {
    const modalEl = document.getElementById(PROMOTION_MODAL_ID);
    const handleHide = () => {
      formRef.current?.reset();
      setType("PERCENTAGE");
      setBuyProducts([]);
      setGetProducts([]);
      onClose();
    };
    modalEl?.addEventListener("hide", handleHide);
    return () => modalEl?.removeEventListener("hide", handleHide);
  }, [onClose]);

  const showMinOrder = type === "PERCENTAGE" || type === "FIXED_AMOUNT" || type === "SPEND_GET_FREE";

  return (
    <s-modal
      id={PROMOTION_MODAL_ID}
      heading={isEdit ? "Edit Promotion" : "Add Promotion"}
      size="large"
    >
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value={isEdit ? "updatePromotion" : "createPromotion"} />
        {isEdit && <input type="hidden" name="id" value={editingPromotion.id} />}

        {/* Hidden fields for variant IDs and dates - use shopifyVariantId for variant-level promotion matching */}
        <input type="hidden" name="buyProductIds" value={JSON.stringify(buyProducts.map((p) => p.shopifyVariantId))} />
        <input type="hidden" name="getProductIds" value={JSON.stringify(getProducts.map((p) => p.shopifyVariantId))} />
        <input type="hidden" name="startsAt" value={startDate} />
        <input type="hidden" name="endsAt" value={endDate} />

        <s-grid gridTemplateColumns="1fr auto" gap="large">
          {/* Column 1: Input Fields */}
          <s-stack gap="base">
            <s-select
              label="Promotion Type"
              name="type"
              key={`type-${editingPromotion?.id || "new"}`}
              value={type}
              onChange={(e: Event) => {
                setType((e.target as HTMLSelectElement).value as PromotionType);
                // Clear values and product selections when type changes
                setValue("");
                setMinOrderCents("");
                setBuyQuantity("1");
                setGetQuantity("1");
                setBuyProducts([]);
                setGetProducts([]);
              }}
            >
              <s-option value="PERCENTAGE">Spend over X, get Y% off</s-option>
              <s-option value="FIXED_AMOUNT">Spend over X, get $Y off</s-option>
              <s-option value="BUY_X_GET_Y">Buy X of product, get Y free</s-option>
              <s-option value="SPEND_GET_FREE">Spend over X, get Y items free</s-option>
            </s-select>

            {/* Qualification Section */}
            <s-divider />
            <s-stack gap="base">
              <s-heading>Qualification</s-heading>

              {/* PERCENTAGE & FIXED_AMOUNT & SPEND_GET_FREE: Min Order Amount */}
              {showMinOrder && (
                <s-number-field
                  label="Minimum Order Amount ($)"
                  name="minOrderCents"
                  key={`minOrder-${editingPromotion?.id || "new"}-${type}`}
                  step={0.01}
                  min={0}
                  value={minOrderCents}
                  onInput={(e: Event) => setMinOrderCents((e.target as HTMLInputElement).value)}
                />
              )}

              {/* BUY_X_GET_Y: Buy Product + Buy Quantity */}
              {type === "BUY_X_GET_Y" && (
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems={"end"}>
                  {onLoadProducts && (
                    <ProductPicker
                      heading="Select product to buy"
                      label="Product to Buy"
                      selectedProducts={buyProducts}
                      onSelect={setBuyProducts}
                      onLoadProducts={onLoadProducts}
                      multiple={false}
                      selectButtonText="Select Product"
                    />
                  )}
                  <s-number-field
                    label="Quantity"
                    name="buyQuantity"
                    key={`buyQty-${editingPromotion?.id || "new"}`}
                    min={1}
                    max={99}
                    value={buyQuantity}
                    onInput={(e: Event) => setBuyQuantity((e.target as HTMLInputElement).value)}
                    required
                  />
                </s-grid>
              )}
            </s-stack>

            {/* Promotion Section */}
            <s-divider />
            <s-stack gap="base">
              <s-heading>Reward</s-heading>

              {/* PERCENTAGE: Discount Percentage */}
              {type === "PERCENTAGE" && (
                <s-number-field
                  label="Discount Percentage (%)"
                  name="value"
                  key={`value-pct-${editingPromotion?.id || "new"}`}
                  step={1}
                  min={1}
                  max={100}
                  value={value}
                  onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)}
                  required
                />
              )}

              {/* FIXED_AMOUNT: Discount Amount */}
              {type === "FIXED_AMOUNT" && (
                <s-number-field
                  label="Discount Amount ($)"
                  name="value"
                  key={`value-fixed-${editingPromotion?.id || "new"}`}
                  step={0.01}
                  min={0}
                  value={value}
                  onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)}
                  required
                />
              )}

              {/* BUY_X_GET_Y: Get Quantity Free + Get Product */}
              {type === "BUY_X_GET_Y" && (
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems={"end"}>
                  {onLoadProducts && (
                    <ProductPicker
                      heading="Select free product"
                      label="Get Product FREE"
                      selectedProducts={getProducts}
                      onSelect={setGetProducts}
                      onLoadProducts={onLoadProducts}
                      multiple={false}
                      selectButtonText="Select Product"
                    />
                  )}
                  <s-number-field
                    label="Quantity"
                    name="getQuantity"
                    key={`getQty-bxgy-${editingPromotion?.id || "new"}`}
                    min={1}
                    max={99}
                    value={getQuantity}
                    onInput={(e: Event) => setGetQuantity((e.target as HTMLInputElement).value)}
                    required
                  />
                </s-grid>
              )}

              {/* SPEND_GET_FREE: Free Items Quantity + Get Product */}
              {type === "SPEND_GET_FREE" && (
                <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems={"end"}>
                  {onLoadProducts && (
                    <ProductPicker
                      heading="Select free product"
                      label="Free Product"
                      selectedProducts={getProducts}
                      onSelect={setGetProducts}
                      onLoadProducts={onLoadProducts}
                      multiple={false}
                      selectButtonText="Select Product"
                    />
                  )}
                  <s-number-field
                    label="Free Items Quantity"
                    name="getQuantity"
                    key={`getQty-spend-${editingPromotion?.id || "new"}`}
                    min={1}
                    value={getQuantity}
                    onInput={(e: Event) => setGetQuantity((e.target as HTMLInputElement).value)}
                    required
                  />
                </s-grid>
              )}
            </s-stack>

            {/* Name and Description at the bottom */}
            <s-divider />
            <s-text-field
              label="Name"
              name="name"
              key={`name-${editingPromotion?.id || "new"}`}
              value={name || autoTitle}
              onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
              required
              placeholder="Auto-generated from settings"
            />

            <s-text-field
              label="Description"
              name="description"
              key={`desc-${editingPromotion?.id || "new"}`}
              value={description}
              onInput={(e: Event) => setDescription((e.target as HTMLInputElement).value)}
              placeholder="Optional description"
            />
          </s-stack>

          {/* Column 2: Date Range */}
          <s-stack direction="block" gap="base">
            <s-text>Promotion Period</s-text>
            <s-date-picker
              type="range"
              name="date-range-display"
              value={endDate ? `${startDate}--${endDate}` : startDate}
              view={startDate.slice(0, 7)}
              onChange={(e: Event) => {
                const val = (e.target as HTMLInputElement).value;
                if (val.includes("--")) {
                  const [start, end] = val.split("--");
                  setStartDate(start);
                  setEndDate(end);
                } else {
                  setStartDate(val);
                  setEndDate("");
                }
              }}
            />
            <s-grid gridTemplateColumns="1fr auto 1fr" gap="small-300" alignItems={"center"}>
              <s-text-field value={formatDateDisplay(startDate)} readOnly={true} />
              <s-text>-</s-text>
              <s-text-field value={endDate ? formatDateDisplay(endDate) : "no end date"} readOnly={true} />
            </s-grid>
          </s-stack>
        </s-grid>
      </fetcher.Form>

      <s-button slot="secondary-actions" commandFor={PROMOTION_MODAL_ID} command="--hide">
        Cancel
      </s-button>
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={fetcher.state !== "idle"}
        onClick={() => formRef.current?.requestSubmit()}
      >
        {fetcher.state !== "idle" ? "Saving..." : isEdit ? "Update" : "Create"}
      </s-button>
    </s-modal>
  );
}
