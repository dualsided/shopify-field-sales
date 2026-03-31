import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher, useSearchParams } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getMonthlyQuotas, copyQuotasToMonth, type QuotaListItem } from "../services/quota.server";
import { getActiveSalesReps } from "../services/salesRep.server";

interface LoaderData {
  quotas: QuotaListItem[];
  reps: { id: string; name: string }[];
  year: number;
  month: number;
  shopId: string | null;
}

interface ActionData {
  success?: boolean;
  message?: string;
  error?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getPaceColor(indicator: string): "success" | "info" | "warning" | "critical" {
  switch (indicator) {
    case "ahead": return "success";
    case "on_pace": return "info";
    case "behind": return "warning";
    case "at_risk": return "critical";
    default: return "info";
  }
}

function getPaceLabel(indicator: string): string {
  switch (indicator) {
    case "ahead": return "Ahead";
    case "on_pace": return "On Pace";
    case "behind": return "Behind";
    case "at_risk": return "At Risk";
    default: return "";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const now = new Date();
  const year = parseInt(url.searchParams.get("year") || String(now.getFullYear()));
  const month = parseInt(url.searchParams.get("month") || String(now.getMonth() + 1));

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { quotas: [], reps: [], year, month, shopId: null };
  }

  const [quotas, reps] = await Promise.all([
    getMonthlyQuotas(shop.id, year, month),
    getActiveSalesReps(shop.id),
  ]);

  return {
    quotas,
    reps: reps.map(r => ({ id: r.id, name: r.name })),
    year,
    month,
    shopId: shop.id,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "copyFromPrevious") {
    const toYear = parseInt(formData.get("toYear") as string);
    const toMonth = parseInt(formData.get("toMonth") as string);

    // Calculate previous month
    let fromYear = toYear;
    let fromMonth = toMonth - 1;
    if (fromMonth < 1) {
      fromMonth = 12;
      fromYear--;
    }

    const result = await copyQuotasToMonth(shop.id, fromYear, fromMonth, toYear, toMonth);

    if (result.success) {
      return { success: true, message: `Copied ${result.count} quotas from ${MONTH_NAMES[fromMonth - 1]}` };
    }
    return { success: false, error: result.error };
  }

  return { success: false, error: "Unknown action" };
};

export default function QuotasPage() {
  const { quotas, reps, year, month, shopId } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handlePeriodChange = () => {
    setSearchParams({ year: String(selectedYear), month: String(selectedMonth) });
  };

  const handleCopyFromPrevious = () => {
    fetcher.submit(
      { _action: "copyFromPrevious", toYear: String(year), toMonth: String(month) },
      { method: "POST" }
    );
  };

  if (!shopId) {
    return (
      <s-page heading="Quotas">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before managing quotas.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const repsWithoutQuotas = reps.filter(r => !quotas.some(q => q.repId === r.id));

  return (
    <s-page heading="Quotas">
      <s-link slot="secondary-actions" href={`/app/quotas/manage?year=${year}&month=${month}`}>
        Set Quotas
      </s-link>

      <s-box paddingBlock="base">
        <s-paragraph>
          Track monthly revenue quotas for your sales team. Set targets and monitor progress.
        </s-paragraph>
      </s-box>

      {/* Period Selector */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Select Period</s-heading>
          <s-grid gap="base" gridTemplateColumns="1fr 1fr auto">
            <s-select
              label="Month"
              value={String(selectedMonth)}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setSelectedMonth(parseInt(target.value));
              }}
            >
              {MONTH_NAMES.map((name, i) => (
                <s-option key={i + 1} value={String(i + 1)}>{name}</s-option>
              ))}
            </s-select>
            <s-select
              label="Year"
              value={String(selectedYear)}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setSelectedYear(parseInt(target.value));
              }}
            >
              {[year - 1, year, year + 1].map(y => (
                <s-option key={y} value={String(y)}>{y}</s-option>
              ))}
            </s-select>
            <s-box paddingBlockStart="base">
              <s-button onClick={handlePeriodChange}>View</s-button>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Summary */}
      <s-section>
        <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="none">
              <s-text color="subdued">Reps with Quotas</s-text>
              <s-heading>{quotas.length}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="none">
              <s-text color="subdued">Total Target</s-text>
              <s-heading>
                {formatCents(quotas.reduce((sum, q) => sum + q.targetCents, 0))}
              </s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="none">
              <s-text color="subdued">Total Achieved</s-text>
              <s-heading>
                {formatCents(quotas.reduce((sum, q) => sum + q.achievedCents, 0))}
              </s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Quick Actions */}
      {quotas.length === 0 && (
        <s-section>
          <s-banner tone="info">
            No quotas set for {MONTH_NAMES[month - 1]} {year}.
          </s-banner>
          <s-box paddingBlockStart="base">
            <s-grid gap="base" gridTemplateColumns="auto auto 1fr">
              <s-button variant="secondary" onClick={() => navigate(`/app/quotas/manage?year=${year}&month=${month}`)}>
                Set Quotas
              </s-button>
              <s-button variant="tertiary" onClick={handleCopyFromPrevious}>
                Copy from Previous Month
              </s-button>
              <span />
            </s-grid>
          </s-box>
        </s-section>
      )}

      {/* Quota Table */}
      <s-section padding="none" accessibilityLabel="Quotas list">
        {quotas.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header>Sales Rep</s-table-header>
              <s-table-header>Target</s-table-header>
              <s-table-header>Achieved</s-table-header>
              <s-table-header>Projected</s-table-header>
              <s-table-header>Progress</s-table-header>
              <s-table-header>Status</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {quotas.map((quota) => (
                <s-table-row key={quota.id} clickDelegate={`quota-link-${quota.id}`}>
                  <s-table-cell>
                    <s-link
                      id={`quota-link-${quota.id}`}
                      onClick={() => navigate(`/app/reps/${quota.repId}`)}
                    >
                      {quota.repName}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{formatCents(quota.targetCents)}</s-table-cell>
                  <s-table-cell>{formatCents(quota.achievedCents)}</s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{formatCents(quota.projectedCents)}</s-text>
                  </s-table-cell>
                  <s-table-cell>{quota.progressPercent}%</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={getPaceColor(quota.onPaceIndicator)}>
                      {getPaceLabel(quota.onPaceIndicator)}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {/* Reps without quotas */}
      {repsWithoutQuotas.length > 0 && quotas.length > 0 && (
        <s-section>
          <s-stack gap="base">
            <s-heading>Reps Without Quotas ({repsWithoutQuotas.length})</s-heading>
            <s-text color="subdued">
              {repsWithoutQuotas.map(r => r.name).join(", ")}
            </s-text>
            <s-button variant="secondary" onClick={() => navigate(`/app/quotas/manage?year=${year}&month=${month}`)}>
              Set Quotas for All Reps
            </s-button>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
