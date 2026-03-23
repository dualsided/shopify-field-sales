import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher, Form } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  getOrderById,
  cancelOrder,
  deleteOrder,
  submitOrderForPayment,
  deleteShopifyDraftOrder,
  markOrderPaid,
  type OrderDetail,
} from "../services/order.server";
import {
  getContactPaymentMethods,
  syncContactToShopifyCustomer,
  type CustomerPaymentMethod,
} from "../services/customer.server";
import type { OrderStatus } from "@prisma/client";

interface LoaderData {
  order: OrderDetail | null;
  shopId: string | null;
  paymentMethods: CustomerPaymentMethod[];
}

interface ActionData {
  success?: boolean;
  error?: string;
  deleted?: boolean;
  shopifyDraftOrderId?: string;
  shopifyOrderId?: string;
  shopifyOrderNumber?: string;
  paymentStatus?: 'invoice_sent' | 'paid' | 'pending';
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const orderId = params.id;

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop || !orderId) {
    return { order: null, shopId: null, paymentMethods: [] };
  }

  const order = await getOrderById(shop.id, orderId);

  // For draft orders with a contact, fetch available payment methods
  let paymentMethods: CustomerPaymentMethod[] = [];
  if (order?.status === "DRAFT" && order.contact?.id) {
    // First ensure contact is synced to Shopify
    const contactRecord = await prisma.companyContact.findUnique({
      where: { id: order.contact.id },
    });

    if (contactRecord) {
      // Sync contact if not already synced
      if (!contactRecord.shopifyCustomerId) {
        await syncContactToShopifyCustomer(contactRecord.id, admin);
      }

      // Fetch payment methods
      const pmResult = await getContactPaymentMethods(contactRecord.id, admin);
      if (pmResult.success) {
        paymentMethods = pmResult.paymentMethods;
      }
    }
  }

  return { order, shopId: shop.id, paymentMethods };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const orderId = params.id;

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop || !orderId) {
    return { error: "Invalid request" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  switch (actionType) {
    case "submit": {
      const paymentMethodId = formData.get("paymentMethodId") as string | null;
      const result = await submitOrderForPayment(shop.id, orderId, admin, {
        paymentMethodId: paymentMethodId || undefined,
        sendInvoice: !paymentMethodId, // Send invoice only if not charging card
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
      // First delete from Shopify if synced
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

    default:
      return { error: "Unknown action" };
  }
};

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusTone(status: OrderStatus): "info" | "success" | "warning" | "critical" {
  switch (status) {
    case "DRAFT":
      return "info";
    case "PENDING":
      return "warning";
    case "PAID":
      return "success";
    case "CANCELLED":
      return "critical";
    case "REFUNDED":
      return "critical";
    default:
      return "info";
  }
}

function formatPaymentTerms(terms: string): string {
  const map: Record<string, string> = {
    DUE_ON_ORDER: "Due on Order",
    NET_15: "Net 15",
    NET_30: "Net 30",
    NET_45: "Net 45",
    NET_60: "Net 60",
  };
  return map[terms] || terms;
}

export default function OrderDetailPage() {
  const { order, shopId, paymentMethods } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.deleted) {
      shopify.toast.show("Order deleted");
      navigate("/app/orders");
    }
    if (fetcher.data?.success) {
      if (fetcher.data.paymentStatus === 'paid') {
        shopify.toast.show(`Order completed and paid: ${fetcher.data.shopifyOrderNumber}`);
      } else if (fetcher.data.paymentStatus === 'invoice_sent') {
        shopify.toast.show("Order submitted - invoice sent to customer");
      } else if (fetcher.data.shopifyDraftOrderId) {
        shopify.toast.show("Order submitted to Shopify");
      } else {
        shopify.toast.show("Order updated");
      }
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  if (!shopId || !order) {
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

  const canSubmit = order.status === "DRAFT";
  const canCancel = order.status !== "CANCELLED" && order.status !== "REFUNDED";
  const canDelete = order.status === "DRAFT";
  const canMarkPaid = order.status === "PENDING";

  return (
    <s-page heading={`Order ${order.orderNumber}`}>
      <s-link slot="breadcrumb-actions" href="/app/orders">
        Orders
      </s-link>

      {order.status === "CANCELLED" && (
        <s-section>
          <s-banner tone="critical">This order has been cancelled.</s-banner>
        </s-section>
      )}

      {order.status === "REFUNDED" && (
        <s-section>
          <s-banner tone="warning">This order has been refunded.</s-banner>
        </s-section>
      )}

      {/* Order Summary */}
      <s-section heading="Order Summary">
        <s-grid gap="base" gridTemplateColumns="repeat(4, 1fr)">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Status</s-text>
              <s-badge tone={getStatusTone(order.status)}>
                {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
              </s-badge>
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Total</s-text>
              <s-text>{formatCurrency(order.totalCents, order.currency)}</s-text>
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Payment Terms</s-text>
              <s-text>{formatPaymentTerms(order.paymentTerms)}</s-text>
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Created</s-text>
              <s-text>{formatDate(order.createdAt)}</s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Shopify Integration Status */}
      <s-section heading="Shopify Integration">
        <s-grid gap="base" gridTemplateColumns="repeat(2, 1fr)">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Draft Order ID</s-text>
              <s-text>{order.shopifyDraftOrderId || "Not synced"}</s-text>
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Shopify Order</s-text>
              <s-text>{order.shopifyOrderNumber || "Not completed"}</s-text>
            </s-stack>
          </s-box>
        </s-grid>

        {canSubmit && (
          <s-box paddingBlockStart="base">
            <s-stack gap="base">
              <s-heading>Submit Order</s-heading>

              {/* Option 1: Send Invoice (Default) */}
              <s-box padding="base" background="subdued" borderRadius="base">
                <Form method="post">
                  <input type="hidden" name="_action" value="submit" />
                  <s-stack gap="small-200">
                    <s-text>Send invoice to customer for payment</s-text>
                    {order.contact?.email && (
                      <s-text color="subdued">Invoice will be sent to: {order.contact.email}</s-text>
                    )}
                    <s-button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Submitting..." : "Send Invoice"}
                    </s-button>
                  </s-stack>
                </Form>
              </s-box>

              {/* Option 2: Charge Saved Card */}
              {paymentMethods.length > 0 && (
                <s-box padding="base" background="subdued" borderRadius="base">
                  <s-stack gap="small-200">
                    <s-text>Charge saved payment method</s-text>
                    {paymentMethods.map((pm) => (
                      <Form method="post" key={pm.id}>
                        <input type="hidden" name="_action" value="submit" />
                        <input type="hidden" name="paymentMethodId" value={pm.id} />
                        <s-button type="submit" variant="secondary" disabled={isSubmitting}>
                          {isSubmitting ? "Processing..." : `Charge ${pm.instrument.brand} ****${pm.instrument.lastDigits}`}
                        </s-button>
                      </Form>
                    ))}
                  </s-stack>
                </s-box>
              )}

              {paymentMethods.length === 0 && order.contact && (
                <s-text color="subdued">
                  No saved payment methods. Customer can add one when paying the invoice.
                </s-text>
              )}
            </s-stack>
          </s-box>
        )}

        {canMarkPaid && (
          <s-box paddingBlockStart="base">
            <Form method="post">
              <input type="hidden" name="_action" value="markPaid" />
              <s-button type="submit" disabled={isSubmitting}>
                Mark as Paid
              </s-button>
            </Form>
          </s-box>
        )}
      </s-section>

      {/* Company & Rep Info */}
      <s-section heading="Order Details">
        <s-grid gap="base" gridTemplateColumns="repeat(2, 1fr)">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-200">
              <s-heading>Company</s-heading>
              <s-link onClick={() => navigate(`/app/companies/${order.company.id}`)}>
                {order.company.name}
              </s-link>
              {order.company.accountNumber && (
                <s-text color="subdued">Account: {order.company.accountNumber}</s-text>
              )}
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-200">
              <s-heading>Sales Rep</s-heading>
              <s-text>{order.salesRep.name}</s-text>
            </s-stack>
          </s-box>
        </s-grid>

        {order.contact && (
          <s-box paddingBlockStart="base">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-200">
                <s-heading>Contact</s-heading>
                <s-text>{order.contact.name}</s-text>
                <s-text color="subdued">{order.contact.email}</s-text>
              </s-stack>
            </s-box>
          </s-box>
        )}

        {(order.poNumber || order.note) && (
          <s-box paddingBlockStart="base">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-grid gap="base" gridTemplateColumns="1fr 1fr">
                {order.poNumber && (
                  <s-stack gap="small-100">
                    <s-text color="subdued">PO Number</s-text>
                    <s-text>{order.poNumber}</s-text>
                  </s-stack>
                )}
                {order.note && (
                  <s-stack gap="small-100">
                    <s-text color="subdued">Note</s-text>
                    <s-text>{order.note}</s-text>
                  </s-stack>
                )}
              </s-grid>
            </s-box>
          </s-box>
        )}
      </s-section>

      {/* Addresses */}
      <s-section heading="Addresses">
        <s-grid gap="base" gridTemplateColumns="repeat(2, 1fr)">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-200">
              <s-heading>Shipping Address</s-heading>
              {order.shippingLocation ? (
                <>
                  <s-text>{order.shippingLocation.name}</s-text>
                  {order.shippingLocation.address1 && (
                    <s-text color="subdued">{order.shippingLocation.address1}</s-text>
                  )}
                  {order.shippingLocation.address2 && (
                    <s-text color="subdued">{order.shippingLocation.address2}</s-text>
                  )}
                  <s-text color="subdued">
                    {[
                      order.shippingLocation.city,
                      order.shippingLocation.provinceCode,
                      order.shippingLocation.zipcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </s-text>
                </>
              ) : (
                <s-text color="subdued">No shipping address</s-text>
              )}
            </s-stack>
          </s-box>

          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-200">
              <s-heading>Billing Address</s-heading>
              {order.billingLocation ? (
                <>
                  <s-text>{order.billingLocation.name}</s-text>
                  {order.billingLocation.address1 && (
                    <s-text color="subdued">{order.billingLocation.address1}</s-text>
                  )}
                  {order.billingLocation.address2 && (
                    <s-text color="subdued">{order.billingLocation.address2}</s-text>
                  )}
                  <s-text color="subdued">
                    {[
                      order.billingLocation.city,
                      order.billingLocation.provinceCode,
                      order.billingLocation.zipcode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </s-text>
                </>
              ) : (
                <s-text color="subdued">No billing address</s-text>
              )}
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Line Items */}
      <s-section heading={`Line Items (${order.lineItems.length})`}>
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>SKU</s-table-header>
            <s-table-header>Qty</s-table-header>
            <s-table-header>Unit Price</s-table-header>
            <s-table-header>Total</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {order.lineItems.map((item) => (
              <s-table-row key={item.id}>
                <s-table-cell>
                  <s-stack gap="none">
                    <s-text>{item.title}</s-text>
                    {item.variantTitle && (
                      <s-text color="subdued">{item.variantTitle}</s-text>
                    )}
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  <s-text color="subdued">{item.sku || "—"}</s-text>
                </s-table-cell>
                <s-table-cell>{item.quantity}</s-table-cell>
                <s-table-cell>
                  {formatCurrency(item.unitPriceCents, order.currency)}
                </s-table-cell>
                <s-table-cell>
                  {formatCurrency(item.totalCents, order.currency)}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {/* Totals */}
        <s-box paddingBlockStart="base">
          <s-box padding="base">
            <s-stack gap="small-200">
              <s-grid gap="small-200" gridTemplateColumns="1fr auto">
                <s-text>Subtotal:</s-text>
                <s-text>{formatCurrency(order.subtotalCents, order.currency)}</s-text>
              </s-grid>

              {order.discountCents > 0 && (
                <s-grid gap="small-200" gridTemplateColumns="1fr auto">
                  <s-text color="subdued">Discount:</s-text>
                  <s-text color="subdued">-{formatCurrency(order.discountCents, order.currency)}</s-text>
                </s-grid>
              )}

              {order.shippingCents > 0 && (
                <s-grid gap="small-200" gridTemplateColumns="1fr auto">
                  <s-text color="subdued">Shipping:</s-text>
                  <s-text color="subdued">{formatCurrency(order.shippingCents, order.currency)}</s-text>
                </s-grid>
              )}

              {order.taxCents > 0 && (
                <s-grid gap="small-200" gridTemplateColumns="1fr auto">
                  <s-text color="subdued">Tax:</s-text>
                  <s-text color="subdued">{formatCurrency(order.taxCents, order.currency)}</s-text>
                </s-grid>
              )}

              <s-grid gap="small-200" gridTemplateColumns="1fr auto">
                <s-text>Total:</s-text>
                <s-text>{formatCurrency(order.totalCents, order.currency)}</s-text>
              </s-grid>
            </s-stack>
          </s-box>
        </s-box>
      </s-section>

      {/* Timestamps */}
      <s-section heading="Timeline">
        <s-grid gap="base" gridTemplateColumns="repeat(3, 1fr)">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-100">
              <s-text color="subdued">Created</s-text>
              <s-text>{formatDate(order.createdAt)}</s-text>
            </s-stack>
          </s-box>

          {order.placedAt && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-100">
                <s-text color="subdued">Placed</s-text>
                <s-text>{formatDate(order.placedAt)}</s-text>
              </s-stack>
            </s-box>
          )}

          {order.paidAt && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-100">
                <s-text color="subdued">Paid</s-text>
                <s-text>{formatDate(order.paidAt)}</s-text>
              </s-stack>
            </s-box>
          )}

          {order.cancelledAt && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-100">
                <s-text color="subdued">Cancelled</s-text>
                <s-text>{formatDate(order.cancelledAt)}</s-text>
              </s-stack>
            </s-box>
          )}

          {order.refundedAt && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small-100">
                <s-text color="subdued">Refunded</s-text>
                <s-text>{formatDate(order.refundedAt)}</s-text>
              </s-stack>
            </s-box>
          )}
        </s-grid>
      </s-section>

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
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
