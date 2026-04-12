import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { useState, useMemo } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopOrNull } from "../services/shop.server";
import { getOrders, type OrderListItem } from "../services/order.server";
import type { OrderStatus } from "@prisma/client";

interface LoaderData {
  orders: OrderListItem[];
  shopId: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await getShopOrNull(request);

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

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "AWAITING_REVIEW", label: "Awaiting Review" },
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
    case "AWAITING_REVIEW":
      return "warning";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredOrders = useMemo(() => {
    let result = orders;

    // Only filter by status if a specific status is selected (not "ALL")
    if (statusFilter && statusFilter !== "ALL") {
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

  return (
    <s-page heading="Orders">
      <s-link slot="secondary-actions" href="/app/orders/create">Create Order</s-link>
      <s-stack gap="base">


        <s-paragraph>
          View and manage orders created by sales reps. Orders can be synced to Shopify
          as draft orders before being completed.
        </s-paragraph>

        <s-section accessibilityLabel="Orders list">
          {orders.length === 0 ? (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="base" alignItems="center" justifyContent="center">
                <s-heading>No orders yet</s-heading>
                <s-paragraph>
                  <s-text color="subdued">Orders will appear here once sales reps start creating them.</s-text>
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
                    <s-option key={opt.value} value={opt.value}>
                      {opt.label}
                    </s-option>
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
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
