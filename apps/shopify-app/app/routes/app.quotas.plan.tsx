import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher, useSearchParams } from "react-router";
import { useState, useEffect, useMemo } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "@field-sales/database";
import {
  getRepQuotasForDateRange,
  bulkUpsertRepQuotas,
  copyQuotasFromLastYear,
  applyGrowthRateToQuotas,
  type MultiMonthQuotaItem,
} from "../services/quota.server";
import { getActiveSalesReps } from "../services/salesRep.server";

interface RepOption {
  id: string;
  name: string;
}

interface LoaderData {
  shopId: string | null;
  reps: RepOption[];
  selectedRepId: string | null;
  quotaData: MultiMonthQuotaItem | null;
  startYear: number;
  startMonth: number;
  monthsToShow: number;
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

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatCents(cents: number | null): string {
  if (cents === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function centsToDollars(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(0);
}

function dollarsToCents(dollars: string): number {
  const num = parseFloat(dollars);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const now = new Date();
  const startYear = parseInt(url.searchParams.get("startYear") || String(now.getFullYear()));
  const startMonth = parseInt(url.searchParams.get("startMonth") || String(now.getMonth() + 1));
  const monthsToShow = parseInt(url.searchParams.get("months") || "12");
  const selectedRepId = url.searchParams.get("repId") || null;

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return {
      shopId: null,
      reps: [],
      selectedRepId: null,
      quotaData: null,
      startYear,
      startMonth,
      monthsToShow,
    };
  }

  // Get all active reps
  const activeReps = await getActiveSalesReps(shop.id);
  const reps: RepOption[] = activeReps.map(r => ({ id: r.id, name: r.name }));

  // Calculate end date
  let endYear = startYear;
  let endMonth = startMonth + monthsToShow - 1;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear++;
  }

  // Get quota data if rep selected
  let quotaData: MultiMonthQuotaItem | null = null;
  if (selectedRepId) {
    quotaData = await getRepQuotasForDateRange(
      shop.id,
      selectedRepId,
      startYear,
      startMonth,
      endYear,
      endMonth
    );
  }

  return {
    shopId: shop.id,
    reps,
    selectedRepId,
    quotaData,
    startYear,
    startMonth,
    monthsToShow,
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

  if (actionType === "saveQuotas") {
    const repId = formData.get("repId") as string;
    const quotasJson = formData.get("quotas") as string;

    let quotas: Array<{ year: number; month: number; targetCents: number }>;
    try {
      quotas = JSON.parse(quotasJson);
    } catch {
      return { success: false, error: "Invalid quota data" };
    }

    // Filter out empty/zero quotas
    const validQuotas = quotas.filter(q => q.targetCents > 0);

    if (validQuotas.length === 0) {
      return { success: false, error: "No valid quotas to save" };
    }

    const result = await bulkUpsertRepQuotas(shop.id, { repId, quotas: validQuotas });

    if (result.success) {
      return { success: true, message: `Saved ${result.count} quotas` };
    }
    return { success: false, error: result.error };
  }

  if (actionType === "copyFromLastYear") {
    const repId = formData.get("repId") as string;
    const startYear = parseInt(formData.get("startYear") as string);
    const startMonth = parseInt(formData.get("startMonth") as string);
    const endYear = parseInt(formData.get("endYear") as string);
    const endMonth = parseInt(formData.get("endMonth") as string);
    const growthPercent = parseFloat(formData.get("growthPercent") as string) || 0;

    const result = await copyQuotasFromLastYear(
      shop.id,
      repId,
      startYear,
      startMonth,
      endYear,
      endMonth,
      growthPercent
    );

    if (result.success) {
      return { success: true, message: `Copied ${result.count} quotas from last year` };
    }
    return { success: false, error: result.error };
  }

  if (actionType === "applyGrowth") {
    const repId = formData.get("repId") as string;
    const startYear = parseInt(formData.get("startYear") as string);
    const startMonth = parseInt(formData.get("startMonth") as string);
    const endYear = parseInt(formData.get("endYear") as string);
    const endMonth = parseInt(formData.get("endMonth") as string);
    const growthPercent = parseFloat(formData.get("growthPercent") as string);

    if (isNaN(growthPercent)) {
      return { success: false, error: "Invalid growth percentage" };
    }

    const result = await applyGrowthRateToQuotas(
      shop.id,
      repId,
      startYear,
      startMonth,
      endYear,
      endMonth,
      growthPercent
    );

    if (result.success) {
      return { success: true, message: `Applied ${growthPercent}% growth to ${result.count} quotas` };
    }
    return { success: false, error: result.error };
  }

  return { success: false, error: "Unknown action" };
};

export default function QuotasPlanPage() {
  const {
    shopId,
    reps,
    selectedRepId,
    quotaData,
    startYear,
    startMonth,
    monthsToShow,
  } = useLoaderData<LoaderData>();

  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();

  // Local state
  const [localRepId, setLocalRepId] = useState(selectedRepId || "");
  const [localStartYear, setLocalStartYear] = useState(startYear);
  const [localStartMonth, setLocalStartMonth] = useState(startMonth);
  const [localMonthsToShow, setLocalMonthsToShow] = useState(monthsToShow);
  const [growthPercent, setGrowthPercent] = useState("");

  // Quota values keyed by "year-month"
  const [quotaValues, setQuotaValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (quotaData) {
      for (const m of quotaData.months) {
        initial[`${m.year}-${m.month}`] = centsToDollars(m.targetCents);
      }
    }
    return initial;
  });

  // Update quota values when data changes
  useEffect(() => {
    if (quotaData) {
      const values: Record<string, string> = {};
      for (const m of quotaData.months) {
        values[`${m.year}-${m.month}`] = centsToDollars(m.targetCents);
      }
      setQuotaValues(values);
    }
  }, [quotaData]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      // Refresh data
      const params = new URLSearchParams(searchParams);
      setSearchParams(params);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, searchParams, setSearchParams]);

  // Calculate end date
  const endDate = useMemo(() => {
    let endYear = localStartYear;
    let endMonth = localStartMonth + localMonthsToShow - 1;
    while (endMonth > 12) {
      endMonth -= 12;
      endYear++;
    }
    return { year: endYear, month: endMonth };
  }, [localStartYear, localStartMonth, localMonthsToShow]);

  // Generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const handleLoadData = () => {
    const params = new URLSearchParams();
    if (localRepId) params.set("repId", localRepId);
    params.set("startYear", String(localStartYear));
    params.set("startMonth", String(localStartMonth));
    params.set("months", String(localMonthsToShow));
    setSearchParams(params);
  };

  const handleQuotaChange = (year: number, month: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    setQuotaValues(prev => ({
      ...prev,
      [`${year}-${month}`]: cleaned,
    }));
  };

  const handleSave = () => {
    if (!selectedRepId || !quotaData) return;

    const quotas = quotaData.months.map(m => ({
      year: m.year,
      month: m.month,
      targetCents: dollarsToCents(quotaValues[`${m.year}-${m.month}`] || "0"),
    }));

    fetcher.submit(
      {
        _action: "saveQuotas",
        repId: selectedRepId,
        quotas: JSON.stringify(quotas),
      },
      { method: "POST" }
    );
  };

  const handleCopyFromLastYear = () => {
    if (!selectedRepId) return;

    fetcher.submit(
      {
        _action: "copyFromLastYear",
        repId: selectedRepId,
        startYear: String(startYear),
        startMonth: String(startMonth),
        endYear: String(endDate.year),
        endMonth: String(endDate.month),
        growthPercent: growthPercent || "0",
      },
      { method: "POST" }
    );
  };

  const handleApplyGrowth = () => {
    if (!selectedRepId || !growthPercent) return;

    fetcher.submit(
      {
        _action: "applyGrowth",
        repId: selectedRepId,
        startYear: String(startYear),
        startMonth: String(startMonth),
        endYear: String(endDate.year),
        endMonth: String(endDate.month),
        growthPercent,
      },
      { method: "POST" }
    );
  };

  // Calculate summary
  const summary = useMemo(() => {
    if (!quotaData) return null;

    let totalTarget = 0;
    let totalLastYear = 0;

    for (const m of quotaData.months) {
      totalTarget += dollarsToCents(quotaValues[`${m.year}-${m.month}`] || "0");
      totalLastYear += m.lastYearTargetCents || 0;
    }

    const avgTarget = quotaData.months.length > 0 ? totalTarget / quotaData.months.length : 0;
    const yoyChange = totalLastYear > 0
      ? Math.round(((totalTarget - totalLastYear) / totalLastYear) * 100)
      : null;

    return { totalTarget, avgTarget, yoyChange };
  }, [quotaData, quotaValues]);

  if (!shopId) {
    return (
      <s-page heading="Multi-Month Quota Planning">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before planning quotas.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (reps.length === 0) {
    return (
      <s-page heading="Multi-Month Quota Planning">
        <s-section>
          <s-stack gap="base">
            <s-heading>No Sales Reps</s-heading>
            <s-paragraph>
              You need to add sales reps before planning quotas.
            </s-paragraph>
            <s-button onClick={() => navigate("/app/reps")}>
              Manage Sales Reps
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Multi-Month Quota Planning">
      {selectedRepId && quotaData && (
        <s-button slot="primary-action" variant="primary" onClick={handleSave}>
          Save All
        </s-button>
      )}
      <s-link slot="secondary-actions" href="/app/quotas">
        Back to Quotas
      </s-link>

      <s-box paddingBlock="base">
        <s-paragraph>
          Plan quotas for a sales rep across multiple months. Select a rep and date range to get started.
        </s-paragraph>
      </s-box>

      {/* Rep and Period Selection */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Select Rep and Period</s-heading>
          <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr 1fr auto">
            <s-select
              label="Sales Rep"
              value={localRepId}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setLocalRepId(target.value);
              }}
            >
              <s-option value="">Select a rep...</s-option>
              {reps.map(rep => (
                <s-option key={rep.id} value={rep.id}>{rep.name}</s-option>
              ))}
            </s-select>

            <s-select
              label="Start Month"
              value={String(localStartMonth)}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setLocalStartMonth(parseInt(target.value));
              }}
            >
              {MONTH_NAMES.map((name, i) => (
                <s-option key={i + 1} value={String(i + 1)}>{name}</s-option>
              ))}
            </s-select>

            <s-select
              label="Start Year"
              value={String(localStartYear)}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setLocalStartYear(parseInt(target.value));
              }}
            >
              {yearOptions.map(y => (
                <s-option key={y} value={String(y)}>{y}</s-option>
              ))}
            </s-select>

            <s-select
              label="Months to Show"
              value={String(localMonthsToShow)}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                setLocalMonthsToShow(parseInt(target.value));
              }}
            >
              <s-option value="6">6 months</s-option>
              <s-option value="12">12 months</s-option>
              <s-option value="18">18 months</s-option>
              <s-option value="24">24 months</s-option>
            </s-select>

            <s-box paddingBlockStart="base">
              <s-button onClick={handleLoadData} disabled={!localRepId}>
                Load
              </s-button>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Quick Actions - only show when data loaded */}
      {selectedRepId && quotaData && (
        <s-section>
          <s-stack gap="base">
            <s-heading>Quick Actions</s-heading>
            <s-grid gap="base" gridTemplateColumns="1fr auto auto">
              <s-text-field
                label="Growth %"
                value={growthPercent}
                suffix="%"
                onInput={(e: Event) => {
                  const target = e.target as HTMLInputElement;
                  setGrowthPercent(target.value.replace(/[^0-9.-]/g, ""));
                }}
              />
              <s-box paddingBlockStart="base">
                <s-button variant="secondary" onClick={handleApplyGrowth}>
                  Apply Growth to Existing
                </s-button>
              </s-box>
              <s-box paddingBlockStart="base">
                <s-button variant="secondary" onClick={handleCopyFromLastYear}>
                  Copy from Last Year
                </s-button>
              </s-box>
            </s-grid>
          </s-stack>
        </s-section>
      )}

      {/* Summary - only show when data loaded */}
      {selectedRepId && quotaData && summary && (
        <s-section>
          <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Total for Period</s-text>
                <s-heading>{formatCents(summary.totalTarget)}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Average Monthly</s-text>
                <s-heading>{formatCents(summary.avgTarget)}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">vs Last Year</s-text>
                <s-heading>
                  {summary.yoyChange !== null ? `${summary.yoyChange > 0 ? "+" : ""}${summary.yoyChange}%` : "-"}
                </s-heading>
              </s-stack>
            </s-box>
          </s-grid>
        </s-section>
      )}

      {/* Quota Grid - only show when data loaded */}
      {selectedRepId && quotaData && (
        <s-section>
          <s-stack gap="base">
            <s-heading>Quota Plan for {quotaData.repName}</s-heading>
            <div style={{ overflowX: "auto" }}>
              <s-table>
                <s-table-header-row>
                  <s-table-header>Row</s-table-header>
                  {quotaData.months.map(m => (
                    <s-table-header key={`${m.year}-${m.month}`}>
                      {SHORT_MONTH_NAMES[m.month - 1]} {m.year}
                    </s-table-header>
                  ))}
                </s-table-header-row>

                <s-table-body>
                  {/* Target row */}
                  <s-table-row>
                    <s-table-cell>
                      <s-text type="strong">Target</s-text>
                    </s-table-cell>
                    {quotaData.months.map(m => (
                      <s-table-cell key={`target-${m.year}-${m.month}`}>
                        <s-text-field
                          label="Target"
                          labelAccessibilityVisibility="exclusive"
                          value={quotaValues[`${m.year}-${m.month}`] || ""}
                          prefix="$"
                          onInput={(e: Event) => {
                            const target = e.target as HTMLInputElement;
                            handleQuotaChange(m.year, m.month, target.value);
                          }}
                        />
                      </s-table-cell>
                    ))}
                  </s-table-row>

                  {/* Last Year row */}
                  <s-table-row>
                    <s-table-cell>
                      <s-text color="subdued">Last Year Target</s-text>
                    </s-table-cell>
                    {quotaData.months.map(m => (
                      <s-table-cell key={`ly-${m.year}-${m.month}`}>
                        <s-text color="subdued">
                          {formatCents(m.lastYearTargetCents)}
                        </s-text>
                      </s-table-cell>
                    ))}
                  </s-table-row>

                  {/* Last Year Achieved row */}
                  <s-table-row>
                    <s-table-cell>
                      <s-text color="subdued">Last Year Achieved</s-text>
                    </s-table-cell>
                    {quotaData.months.map(m => (
                      <s-table-cell key={`lya-${m.year}-${m.month}`}>
                        <s-text color="subdued">
                          {formatCents(m.lastYearAchievedCents)}
                        </s-text>
                      </s-table-cell>
                    ))}
                  </s-table-row>

                  {/* YoY Change row */}
                  <s-table-row>
                    <s-table-cell>
                      <s-text color="subdued">YoY Change</s-text>
                    </s-table-cell>
                    {quotaData.months.map(m => {
                      const current = dollarsToCents(quotaValues[`${m.year}-${m.month}`] || "0");
                      const lastYear = m.lastYearTargetCents || 0;
                      const change = lastYear > 0
                        ? Math.round(((current - lastYear) / lastYear) * 100)
                        : null;

                      return (
                        <s-table-cell key={`yoy-${m.year}-${m.month}`}>
                          {change !== null ? (
                            <s-badge tone={change >= 0 ? "success" : "critical"}>
                              {change > 0 ? "+" : ""}{change}%
                            </s-badge>
                          ) : (
                            <s-text color="subdued">-</s-text>
                          )}
                        </s-table-cell>
                      );
                    })}
                  </s-table-row>
                </s-table-body>
              </s-table>
            </div>
          </s-stack>
        </s-section>
      )}

      {/* Empty state */}
      {selectedRepId && !quotaData && (
        <s-section>
          <s-banner tone="info">
            Click "Load" to view and edit quotas for the selected rep.
          </s-banner>
        </s-section>
      )}

      {!selectedRepId && (
        <s-section>
          <s-banner tone="info">
            Select a sales rep to start planning their quotas across multiple months.
          </s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
