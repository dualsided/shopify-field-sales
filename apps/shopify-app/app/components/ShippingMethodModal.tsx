import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ShippingMethod } from "@field-sales/database";

export const SHIPPING_MODAL_ID = "shipping-method-modal";

interface ShippingMethodModalProps {
  editingMethod?: ShippingMethod;
  onClose: () => void;
}

export function ShippingMethodModal({ editingMethod, onClose }: ShippingMethodModalProps) {
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!editingMethod;

  // Close modal and show toast on successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      const modalEl = document.getElementById(SHIPPING_MODAL_ID) as HTMLElement & { hideOverlay: () => void };
      modalEl?.hideOverlay();
      formRef.current?.reset();
      if (fetcher.data.message) {
        shopify.toast.show(fetcher.data.message);
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  // Handle modal hide event to clear state
  useEffect(() => {
    const modalEl = document.getElementById(SHIPPING_MODAL_ID);
    const handleHide = () => {
      formRef.current?.reset();
      onClose();
    };
    modalEl?.addEventListener("hide", handleHide);
    return () => modalEl?.removeEventListener("hide", handleHide);
  }, [onClose]);

  return (
    <s-modal
      id={SHIPPING_MODAL_ID}
      heading={isEdit ? "Edit Shipping Method" : "Add Shipping Method"}
    >
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value={isEdit ? "updateShippingMethod" : "createShippingMethod"} />
        {isEdit && <input type="hidden" name="id" value={editingMethod.id} />}

        <s-stack gap="base">
          <s-text-field
            label="Title"
            name="title"
            key={`title-${editingMethod?.id || "new"}`}
            defaultValue={editingMethod?.title || ""}
            required
            placeholder="e.g., Standard Shipping"
          />
          <s-text-field
            label="Method"
            name="method"
            key={`method-${editingMethod?.id || "new"}`}
            defaultValue={editingMethod?.method || ""}
            required
            placeholder="e.g., Ground, Express, Overnight"
          />
          <s-number-field
            label="Price"
            name="price"
            key={`price-${editingMethod?.id || "new"}`}
            step={0.01}
            min={0}
            defaultValue={editingMethod ? (editingMethod.priceCents / 100).toFixed(2) : ""}
            required
          />
        </s-stack>
      </fetcher.Form>

      <s-button slot="secondary-actions" commandFor={SHIPPING_MODAL_ID} command="--hide">
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
