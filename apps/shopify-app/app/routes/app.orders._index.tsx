import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useState, useMemo, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  getOrders,
  submitOrderForPayment,
  type OrderListItem,
} from "../services/order.server";
import type { OrderStatus } from "@prisma/client";

interface LoaderData {
  orders: OrderListItem[];
  shopId: string | null;
}

interface ActionData {
  success?: boolean;
  error?: string;
  shopifyDraftOrderId?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { orders: [], shopId: null };
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as OrderStatus | null;

  const orders = await getOrders(shop.id, {
    ...(status && { status }),
    limit: 100,
  });

  return { orders, shopId: shop.id };
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
  const orderId = formData.get("orderId") as string;

  if (actionType === "submit" && orderId) {
    const result = await submitOrderForPayment(shop.id, orderId, admin);
    if (result.success) {
      return { success: true, shopifyDraftOrderId: result.shopifyDraftOrderId };
    }
    return { success: false, error: result.error };
  }

  return { success: false, error: "Unknown action" };
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
];

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
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

export default function OrdersPage() {
  const { orders, shopId } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Order submitted - invoice sent to customer");
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const filteredOrders = useMemo(() => {
    let result = orders;

    if (statusFilter) {
      result = result.filter((o) => o.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(query) ||
          o.companyName.toLowerCase().includes(query) ||
          o.salesRepName.toLowerCase().includes(query)
      );
    }

    return result;
  }, [orders, searchQuery, statusFilter]);

  if (!shopId) {
    return (
      <s-page heading="Orders">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before viewing orders.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const handleSubmit = (orderId: string) => {
    fetcher.submit({ _action: "submit", orderId }, { method: "POST" });
  };

  return (
    <s-page heading="Orders">
      <s-box paddingBlock="base">
        <s-paragraph>
          View and manage orders created by sales reps. Orders can be synced to Shopify
          as draft orders before being completed.
        </s-paragraph>
      </s-box>

      <s-section padding="none" accessibilityLabel="Orders list">
        {orders.length === 0 ? (
          <s-box padding="base">
            <s-stack gap="base">
              <s-heading>No orders yet</s-heading>
              <s-paragraph>
                Orders will appear here once sales reps start creating them.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr auto">
              <s-text-field
                icon="search"
                label="Search orders"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search by order #, company, or rep..."
                autocomplete="off"
                value={searchQuery}
                onInput={(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  setSearchQuery(target.value);
                }}
              />
              <s-select
                label="Status"
                labelAccessibilityVisibility="exclusive"
                value={statusFilter}
                onChange={(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  setStatusFilter(target.value);
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </s-select>
            </s-grid>

            <s-table-header-row>
              <s-table-header>Order #</s-table-header>
              <s-table-header>Company</s-table-header>
              <s-table-header>Sales Rep</s-table-header>
              <s-table-header>Items</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {filteredOrders.length === 0 ? (
                <s-table-row>
                  <s-table-cell>
                    <s-text color="subdued">No orders match your filters.</s-text>
                  </s-table-cell>
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                  <s-table-cell />
                </s-table-row>
              ) : (
                filteredOrders.map((order) => (
                  <s-table-row key={order.id} clickDelegate={`order-link-${order.id}`}>
                    <s-table-cell>
                      <s-link
                        id={`order-link-${order.id}`}
                        onClick={() => navigate(`/app/orders/${order.id}`)}
                      >
                        {order.orderNumber}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>{order.companyName}</s-table-cell>
                    <s-table-cell>{order.salesRepName}</s-table-cell>
                    <s-table-cell>{order.lineItemCount}</s-table-cell>
                    <s-table-cell>
                      {formatCurrency(order.totalCents, order.currency)}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={getStatusTone(order.status)}>
                        {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      {order.status === "DRAFT" && (
                        <s-button
                          variant="tertiary"
                          onClick={(e: Event) => {
                            e.stopPropagation();
                            handleSubmit(order.id);
                          }}
                          disabled={isSubmitting}
                        >
                          Submit
                        </s-button>
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
