import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher, Form, useRevalidator } from "react-router";
import { useEffect, useCallback, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  OrderForm,
  type OrderFormData,
  type ProductSearchResult,
  type ShippingOption,
  type TimelineEvent,
  type TaxCalculationInput,
  type TaxCalculationResult,
  type PromotionEvaluationInput,
  type PromotionEvaluationResult,
} from "../components/OrderForm";
import type { Company } from "../components/CompanyPicker";
import type { Contact } from "../components/ContactPicker";
import type { Location } from "../components/LocationPicker";
import { getShopOrNull, getAuthenticatedShop } from "../services/shop.server";
import {
  getOrderById,
  cancelOrder,
  deleteOrder,
  submitOrderForPayment,
  submitOrderForReview,
  declineOrder,
  deleteShopifyDraftOrder,
  markOrderPaid,
  updateOrder,
  updateOrderLineItems,
  getOrderTimeline,
  addTimelineEvent,
  type OrderDetail,
} from "../services/order.server";
import {
  getContact,
  getStoredPaymentMethods,
  syncContactToShopifyCustomer,
  type StoredPaymentMethod,
} from "../services/customer.server";
import { getActiveShippingMethods } from "../services/shippingMethod.server";

interface LoaderData {
  order: OrderDetail | null;
  orderFormData: OrderFormData | null;
  shopId: string | null;
  shopDomain: string | null;
  paymentMethods: StoredPaymentMethod[];
  timelineEvents: TimelineEvent[];
  shippingMethods: ShippingOption[];
}

interface ActionData {
  success?: boolean;
  error?: string;
  deleted?: boolean;
  submittedForApproval?: boolean;
  shopifyDraftOrderId?: string;
  shopifyOrderId?: string;
  shopifyOrderNumber?: string;
  paymentStatus?: 'invoice_sent' | 'paid' | 'authorized' | 'pending_fulfillment' | 'pending_receipt' | 'pending_net' | 'pending';
}

function convertOrderToFormData(order: OrderDetail): OrderFormData {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    shopifyDraftOrderId: order.shopifyDraftOrderId,
    shopifyOrderId: order.shopifyOrderId,
    shopifyOrderNumber: order.shopifyOrderNumber,
    company: order.company
      ? {
          id: order.company.id,
          name: order.company.name,
          accountNumber: order.company.accountNumber,
        }
      : null,
    contact: order.contact
      ? {
          id: order.contact.id,
          name: order.contact.name,
          email: order.contact.email,
        }
      : null,
    salesRepName: order.salesRep.name,
    shippingLocation: order.shippingLocation
      ? {
          id: order.shippingLocation.id,
          name: order.shippingLocation.name,
          address1: order.shippingLocation.address1,
          address2: order.shippingLocation.address2,
          city: order.shippingLocation.city,
          province: order.shippingLocation.province,
          provinceCode: order.shippingLocation.provinceCode,
          zipcode: order.shippingLocation.zipcode,
          country: order.shippingLocation.country,
        }
      : null,
    billingLocation: order.billingLocation
      ? {
          id: order.billingLocation.id,
          name: order.billingLocation.name,
          address1: order.billingLocation.address1,
          address2: order.billingLocation.address2,
          city: order.billingLocation.city,
          province: order.billingLocation.province,
          provinceCode: order.billingLocation.provinceCode,
          zipcode: order.billingLocation.zipcode,
          country: order.billingLocation.country,
        }
      : null,
    lineItems: order.lineItems.map((li) => ({
      id: li.id,
      shopifyProductId: li.shopifyProductId,
      shopifyVariantId: li.shopifyVariantId,
      sku: li.sku,
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
      discountCents: li.discountCents,
      totalCents: li.totalCents,
      // Map isPromotionItem from DB to isFreeItem for frontend
      isFreeItem: li.isPromotionItem,
      promotionId: li.promotionId,
      promotionName: li.promotionName,
    })),
    appliedPromotions: order.appliedPromotions.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      scope: p.scope,
      value: p.value,
      discountCents: p.discountCents,
    })),
    selectedShippingOption: order.shippingMethod
      ? {
          id: order.shippingMethod.id,
          name: order.shippingMethod.title,
          priceCents: order.shippingMethod.priceCents,
        }
      : null,
    note: order.note || "",
    poNumber: order.poNumber || "",
    paymentTerms: order.paymentTerms,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    taxLines: [], // Tax lines will be recalculated when form loads
    totalCents: order.totalCents,
    currency: order.currency,
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shop, session, admin } = await getShopOrNull(request);
  const orderId = params.id;

  if (!shop || !orderId) {
    return { order: null, orderFormData: null, shopId: null, shopDomain: null, paymentMethods: [], timelineEvents: [], shippingMethods: [] };
  }

  const [order, shippingMethodsRaw] = await Promise.all([
    getOrderById(shop.id, orderId),
    getActiveShippingMethods(shop.id),
  ]);

  // Convert shipping methods to ShippingOption format
  const shippingMethods: ShippingOption[] = shippingMethodsRaw.map((sm) => ({
    id: sm.id,
    name: sm.title,
    priceCents: sm.priceCents,
  }));

  if (!order) {
    return { order: null, orderFormData: null, shopId: shop.id, shopDomain: session.shop, paymentMethods: [], timelineEvents: [], shippingMethods };
  }

  // Convert order to form data format
  const orderFormData = convertOrderToFormData(order);

  // Fetch timeline events
  const rawTimelineEvents = await getOrderTimeline(orderId);
  const timelineEvents: TimelineEvent[] = rawTimelineEvents.map((e) => ({
    id: e.id,
    authorType: e.authorType,
    authorId: e.authorId,
    authorName: e.authorName,
    eventType: e.eventType,
    metadata: e.metadata as Record<string, unknown> | null,
    comment: e.comment,
    createdAt: e.createdAt,
  }));

  // For DRAFT and AWAITING_REVIEW orders with a contact, fetch available payment methods
  // These are needed for payment method selection during approval
  // We use our stored payment methods (internal IDs) which work with processOrderPayment
  let paymentMethods: StoredPaymentMethod[] = [];
  const canSelectPaymentMethod = (order.status === "DRAFT" || order.status === "AWAITING_REVIEW") && order.contact?.id;

  if (canSelectPaymentMethod) {
    // First ensure the contact is synced to Shopify (so payment methods can be synced)
    const contactRecord = await getContact(order.contact!.id);
    if (contactRecord && !contactRecord.shopifyCustomerId) {
      await syncContactToShopifyCustomer(contactRecord.id, admin);
    }

    // Get stored payment methods from our database (uses internal IDs)
    paymentMethods = await getStoredPaymentMethods(order.contact!.id);
  }

  // Add payment methods to orderFormData contact for the PaymentSection picker
  if (orderFormData.contact && paymentMethods.length > 0) {
    orderFormData.contact = {
      ...orderFormData.contact,
      paymentMethods: paymentMethods.map((pm) => ({
        id: pm.id, // Internal CUID - this is what processOrderPayment expects
        provider: pm.provider,
        last4: pm.last4 || undefined,
        brand: pm.brand || undefined,
        expiryMonth: pm.expiryMonth || undefined,
        expiryYear: pm.expiryYear || undefined,
        isDefault: pm.isDefault,
      })),
    };
  }

  return { order, orderFormData, shopId: shop.id, shopDomain: session.shop, paymentMethods, timelineEvents, shippingMethods };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop, admin } = await getAuthenticatedShop(request);
  const orderId = params.id;

  if (!orderId) {
    return { error: "Invalid request" };
  }

  const contentType = request.headers.get("content-type");

  // Handle JSON submissions (from OrderForm save)
  if (contentType?.includes("application/json")) {
    const data = await request.json() as OrderFormData;

    // Get current order to check status and compare for timeline events
    const currentOrder = await getOrderById(shop.id, orderId);
    if (!currentOrder) {
      return { error: "Order not found" };
    }

    // Track changes for AWAITING_REVIEW orders
    const isAwaitingReview = currentOrder.status === "AWAITING_REVIEW";
    const changes: Array<{
      eventType: "contact_changed" | "shipping_location_changed" | "billing_location_changed" | "shipping_method_changed" | "po_number_changed" | "note_changed" | "line_item_quantity_changed";
      oldValue: string;
      newValue: string;
    }> = [];

    if (isAwaitingReview) {
      // Compare contact
      if ((currentOrder.contact?.id || null) !== (data.contact?.id || null)) {
        changes.push({
          eventType: "contact_changed" as const,
          oldValue: currentOrder.contact?.name || "None",
          newValue: data.contact?.name || "None",
        });
      }

      // Compare shipping location
      if ((currentOrder.shippingLocation?.id || null) !== (data.shippingLocation?.id || null)) {
        changes.push({
          eventType: "shipping_location_changed" as const,
          oldValue: currentOrder.shippingLocation?.name || "None",
          newValue: data.shippingLocation?.name || "None",
        });
      }

      // Compare billing location
      if ((currentOrder.billingLocation?.id || null) !== (data.billingLocation?.id || null)) {
        changes.push({
          eventType: "billing_location_changed" as const,
          oldValue: currentOrder.billingLocation?.name || "None",
          newValue: data.billingLocation?.name || "None",
        });
      }

      // Compare shipping method
      if ((currentOrder.shippingMethod?.id || null) !== (data.selectedShippingOption?.id || null)) {
        changes.push({
          eventType: "shipping_method_changed" as const,
          oldValue: currentOrder.shippingMethod?.title || "None",
          newValue: data.selectedShippingOption?.name || "None",
        });
      }

      // Compare PO number
      if ((currentOrder.poNumber || "") !== (data.poNumber || "")) {
        changes.push({
          eventType: "po_number_changed" as const,
          oldValue: currentOrder.poNumber || "None",
          newValue: data.poNumber || "None",
        });
      }

      // Compare note
      if ((currentOrder.note || "") !== (data.note || "")) {
        changes.push({
          eventType: "note_changed" as const,
          oldValue: currentOrder.note ? "(previous note)" : "None",
          newValue: data.note ? "(updated note)" : "None",
        });
      }

      // Compare line items (non-free items only)
      const currentItems = currentOrder.lineItems
        .filter(li => !li.isPromotionItem)
        .map(li => ({ variantId: li.shopifyVariantId, qty: li.quantity }));
      const newItems = data.lineItems
        .filter(li => !li.isFreeItem)
        .map(li => ({ variantId: li.shopifyVariantId, qty: li.quantity }));

      if (JSON.stringify(currentItems) !== JSON.stringify(newItems)) {
        changes.push({
          eventType: "line_item_quantity_changed" as const,
          oldValue: `${currentItems.length} items`,
          newValue: `${newItems.length} items`,
        });
      }
    }

    // Update order details
    const updateResult = await updateOrder(shop.id, orderId, {
      contactId: data.contact?.id || null,
      shippingLocationId: data.shippingLocation?.id || null,
      billingLocationId: data.billingLocation?.id || null,
      shippingMethodId: data.selectedShippingOption?.id || null,
      shippingCents: data.selectedShippingOption?.priceCents || 0,
      note: data.note || null,
      poNumber: data.poNumber || null,
      paymentTerms: data.paymentTerms,
    });

    if (!updateResult.success) {
      return { error: updateResult.error };
    }

    // Update line items (map isFreeItem to isPromotionItem for database)
    const lineItemsResult = await updateOrderLineItems(shop.id, orderId, data.lineItems.map((li) => ({
      id: li.id.startsWith("temp_") || li.id.startsWith("free_") ? undefined : li.id,
      shopifyProductId: li.shopifyProductId,
      shopifyVariantId: li.shopifyVariantId,
      sku: li.sku,
      title: li.title,
      variantTitle: li.variantTitle,
      imageUrl: li.imageUrl,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
      discountCents: li.discountCents,
      totalCents: li.totalCents,
      isPromotionItem: li.isFreeItem || false,
      promotionId: li.promotionId,
      promotionName: li.promotionName,
    })));

    if (!lineItemsResult.success) {
      return { error: lineItemsResult.error };
    }

    // Add timeline events for changes to AWAITING_REVIEW orders
    if (isAwaitingReview && changes.length > 0) {
      for (const change of changes) {
        await addTimelineEvent({
          orderId,
          authorType: "ADMIN",
          authorName: "Admin", // TODO: Get actual admin name from session
          eventType: change.eventType,
          metadata: {
            oldValue: change.oldValue,
            newValue: change.newValue,
          },
        });
      }
    }

    return { success: true };
  }

  // Handle form submissions (action buttons)
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  switch (actionType) {
    case "submit": {
      const paymentMethodId = formData.get("paymentMethodId") as string | null;
      const result = await submitOrderForPayment(shop.id, orderId, admin, {
        paymentMethodId: paymentMethodId || undefined,
        sendInvoice: !paymentMethodId,
      });
      if (result.success) {
        return {
          success: true,
          shopifyDraftOrderId: result.shopifyDraftOrderId,
          shopifyOrderId: result.shopifyOrderId,
          shopifyOrderNumber: result.shopifyOrderNumber,
          paymentStatus: result.paymentStatus,
        };
      }
      return { error: result.error };
    }

    case "cancel": {
      const result = await cancelOrder(shop.id, orderId);
      if (result.success) return { success: true };
      return { error: result.error };
    }

    case "delete": {
      const unsyncResult = await deleteShopifyDraftOrder(shop.id, orderId, admin);
      if (!unsyncResult.success) {
        return { error: unsyncResult.error };
      }

      const result = await deleteOrder(shop.id, orderId);
      if (result.success) return { deleted: true };
      return { error: result.error };
    }

    case "markPaid": {
      const result = await markOrderPaid(shop.id, orderId);
      if (result.success) return { success: true };
      return { error: result.error };
    }

    case "submitForApproval": {
      // Set order status to AWAITING_REVIEW and add timeline event
      const submitComment = formData.get("comment") as string | null;
      const submitResult = await submitOrderForReview(shop.id, orderId);

      if (!submitResult.success) {
        return { error: submitResult.error };
      }

      // Add timeline event
      await addTimelineEvent({
        orderId,
        authorType: "SALES_REP",
        authorId: submitResult.order.salesRepId,
        authorName: submitResult.order.salesRepName,
        eventType: "submitted",
        comment: submitComment || null,
      });

      return { success: true, submittedForApproval: true };
    }

    case "approve": {
      // Approve the order and submit to Shopify
      const approveComment = formData.get("comment") as string | null;
      const paymentMethodId = formData.get("paymentMethodId") as string | null;

      try {
        // Add timeline event for approval
        await addTimelineEvent({
          orderId,
          authorType: "ADMIN",
          authorName: "Admin", // TODO: Get actual admin name from session
          eventType: "approved",
          comment: approveComment || null,
        });

        const result = await submitOrderForPayment(shop.id, orderId, admin, {
          paymentMethodId: paymentMethodId || undefined,
          sendInvoice: !paymentMethodId,
        });

        if (result.success) {
          return {
            success: true,
            shopifyDraftOrderId: result.shopifyDraftOrderId,
            shopifyOrderId: result.shopifyOrderId,
            shopifyOrderNumber: result.shopifyOrderNumber,
            paymentStatus: result.paymentStatus,
          };
        }
        return { error: result.error };
      } catch (error) {
        console.error("Error approving order:", error);
        return { error: "Failed to approve order" };
      }
    }

    case "decline": {
      // Decline the order - return to draft status
      const declineComment = formData.get("comment") as string | null;
      const declineResult = await declineOrder(shop.id, orderId);

      if (!declineResult.success) {
        return { error: declineResult.error };
      }

      // Add timeline event for decline
      await addTimelineEvent({
        orderId,
        authorType: "ADMIN",
        authorName: "Admin", // TODO: Get actual admin name from session
        eventType: "declined",
        comment: declineComment || null,
      });

      return { success: true };
    }

    case "addComment": {
      // Add a comment to the timeline
      const comment = formData.get("comment") as string | null;
      if (!comment) {
        return { error: "Comment is required" };
      }

      try {
        await addTimelineEvent({
          orderId,
          authorType: "ADMIN",
          authorName: "Admin", // TODO: Get actual admin name from session
          eventType: "comment",
          comment,
        });

        return { success: true };
      } catch (error) {
        console.error("Error adding comment:", error);
        return { error: "Failed to add comment" };
      }
    }

    default:
      return { error: "Unknown action" };
  }
};

export default function OrderDetailPage() {
  const { order, orderFormData, shopId, shopDomain, paymentMethods, timelineEvents, shippingMethods } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const lastHandledFetcherKey = useRef<string | null>(null);

  const isSubmitting = fetcher.state !== "idle" || revalidator.state === "loading";

  // Handle fetcher responses (only once per unique response)
  useEffect(() => {
    // Create a unique key for this response to prevent handling it multiple times
    const responseKey = fetcher.data ? JSON.stringify(fetcher.data) : null;
    if (responseKey && responseKey === lastHandledFetcherKey.current) {
      return; // Already handled this response
    }

    if (fetcher.data?.deleted) {
      lastHandledFetcherKey.current = responseKey;
      shopify.toast.show("Order deleted");
      navigate("/app/orders");
    }
    if (fetcher.data?.success) {
      lastHandledFetcherKey.current = responseKey;
      if (fetcher.data.submittedForApproval) {
        shopify.toast.show("Order submitted for approval");
      } else if (fetcher.data.paymentStatus === 'paid') {
        shopify.toast.show(`Order approved and paid: ${fetcher.data.shopifyOrderNumber}`);
      } else if (fetcher.data.paymentStatus === 'authorized') {
        shopify.toast.show(`Order approved - payment authorized: ${fetcher.data.shopifyOrderNumber}`);
      } else if (fetcher.data.paymentStatus === 'pending_fulfillment') {
        shopify.toast.show(`Order approved: ${fetcher.data.shopifyOrderNumber} - payment due on fulfillment`);
      } else if (fetcher.data.paymentStatus === 'pending_receipt') {
        shopify.toast.show(`Order approved: ${fetcher.data.shopifyOrderNumber} - payment due on receipt`);
      } else if (fetcher.data.paymentStatus === 'pending_net') {
        shopify.toast.show(`Order approved: ${fetcher.data.shopifyOrderNumber} - payment due per terms`);
      } else if (fetcher.data.paymentStatus === 'invoice_sent') {
        shopify.toast.show("Order approved - invoice sent to customer");
      } else if (fetcher.data.shopifyDraftOrderId) {
        shopify.toast.show("Order approved and submitted to Shopify");
      } else {
        shopify.toast.show("Order updated");
      }
      // Revalidate to reload fresh data from database (including promotion items)
      revalidator.revalidate();
    }
    if (fetcher.data?.error) {
      lastHandledFetcherKey.current = responseKey;
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate, revalidator]);

  // OrderForm callbacks
  const handleSave = useCallback((data: OrderFormData) => {
    fetcher.submit(JSON.stringify(data), {
      method: "POST",
      encType: "application/json",
    });
  }, [fetcher]);

  const handleCancel = useCallback(() => {
    navigate("/app/orders");
  }, [navigate]);

  // Submit for approval - sets status to AWAITING_REVIEW
  const handleSubmitForApproval = useCallback((comment?: string) => {
    const formData = new FormData();
    formData.set("_action", "submitForApproval");
    if (comment) {
      formData.set("comment", comment);
    }
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher]);

  // Approve order - submits to Shopify
  const handleApprove = useCallback((comment?: string, paymentMethodId?: string) => {
    const formData = new FormData();
    formData.set("_action", "approve");
    if (comment) {
      formData.set("comment", comment);
    }
    if (paymentMethodId) {
      formData.set("paymentMethodId", paymentMethodId);
    }
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher]);

  // Decline order - returns to draft status
  const handleDecline = useCallback((comment?: string) => {
    const formData = new FormData();
    formData.set("_action", "decline");
    if (comment) {
      formData.set("comment", comment);
    }
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher]);

  // Add comment to timeline
  const handleAddComment = useCallback((comment: string) => {
    const formData = new FormData();
    formData.set("_action", "addComment");
    formData.set("comment", comment);
    fetcher.submit(formData, { method: "POST" });
  }, [fetcher]);

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

  const handleCalculateTax = useCallback(async (input: TaxCalculationInput): Promise<TaxCalculationResult> => {
    const response = await fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!data.success) {
      console.error("Tax calculation failed:", data.error);
      return { taxCents: 0, taxLines: [] };
    }
    return { taxCents: data.taxCents, taxLines: data.taxLines };
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

  if (!shopId || !order || !orderFormData) {
    return (
      <s-page heading="Order Not Found">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>This order was not found or you don't have access.</s-paragraph>
            <s-button onClick={() => navigate("/app/orders")}>Back to Orders</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  // Cancel must happen in Shopify directly for orders already synced
  // Delete is for DRAFT/AWAITING_REVIEW orders not yet in Shopify
  const canCancel = false;
  const canDelete = (order.status === "DRAFT" || order.status === "AWAITING_REVIEW") && !order.shopifyOrderId;

  // Company, Contact, Location, and Products are editable only for DRAFT and AWAITING_REVIEW
  const isReadonly = order.status !== "DRAFT" && order.status !== "AWAITING_REVIEW";

  // Always use OrderForm
  return (
    <OrderForm
      mode="edit"
      initialData={orderFormData}
      onSave={handleSave}
      onCancel={handleCancel}
      onLoadProducts={handleLoadProducts}
      onSearchProducts={handleSearchProducts}
      onLoadShippingOptions={handleLoadShippingOptions}
      initialShippingOptions={shippingMethods}
      onLoadCompanies={handleLoadCompanies}
      onLoadContacts={handleLoadContacts}
      onLoadLocations={handleLoadLocations}
      onCalculateTax={handleCalculateTax}
      onEvaluatePromotions={handleEvaluatePromotions}
      isSubmitting={isSubmitting}
      onSubmitForApproval={handleSubmitForApproval}
      onApprove={handleApprove}
      onDecline={handleDecline}
      onAddComment={handleAddComment}
      shopDomain={shopDomain || undefined}
      readonly={isReadonly}
      timelineEvents={timelineEvents}
    >

      {/* Actions */}
      <s-box padding="small-500">
        <s-grid gap="base" gridTemplateColumns="auto auto 1fr">
          {canCancel && (
            <Form method="post">
              <input type="hidden" name="_action" value="cancel" />
              <s-button variant="tertiary" tone="critical" type="submit" icon="x">
                Cancel Order
              </s-button>
            </Form>
          )}

          {canDelete && (
            <Form method="post">
              <input type="hidden" name="_action" value="delete" />
              <s-button variant="tertiary" tone="critical" type="submit" icon="delete">
                Delete Order
              </s-button>
            </Form>
          )}
        </s-grid>
      </s-box>
    </OrderForm>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
