import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "@field-sales/database";
import { bulkUpsertRepQuotas } from "../services/quota.server";

interface MonthData {
  year: number;
  month: number;
  targetCents: number | null;
  achievedCents: number;
}

interface LoaderData {
  shopId: string | null;
  rep: {
    id: string;
    name: string;
    email: string;
  } | null;
  months: MonthData[];
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

function parseDollarsToCents(value: string): number | null {
  if (!value || value.trim() === "") return null;
  // Remove $ and commas, parse as float
  const cleaned = value.replace(/[$,]/g, "").trim();
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

function centsToDisplayValue(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(0);
}

// Generate full years from current year through +2 years (3 full years)
function generateFullYears(): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  const currentYear = new Date().getFullYear();

  // Generate 3 full years: current year, next year, year after
  for (let year = currentYear; year <= currentYear + 2; year++) {
    for (let month = 1; month <= 12; month++) {
      months.push({ year, month });
    }
  }

  return months;
}

function isMonthInPast(year: number, month: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return year < currentYear || (year === currentYear && month < currentMonth);
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const repId = params.repId;

  if (!repId) {
    return { shopId: null, rep: null, months: [] };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { shopId: null, rep: null, months: [] };
  }

  const rep = await prisma.salesRep.findFirst({
    where: { id: repId, shopId: shop.id },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!rep) {
    return { shopId: shop.id, rep: null, months: [] };
  }

  // Generate full years (current year + 2 more years)
  const monthRange = generateFullYears();

  // Fetch existing quotas
  const quotas = await prisma.repQuota.findMany({
    where: {
      shopId: shop.id,
      repId: rep.id,
      OR: monthRange.map(({ year, month }) => ({ year, month })),
    },
  });

  const quotaMap = new Map(quotas.map(q => [`${q.year}-${q.month}`, q]));

  // Fetch revenue for each month
  const months: MonthData[] = [];

  for (const { year, month } of monthRange) {
    const quota = quotaMap.get(`${year}-${month}`);

    // Calculate revenue for this month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const paidOrders = await prisma.order.aggregate({
      where: {
        shopId: shop.id,
        salesRepId: rep.id,
        status: "PAID",
        placedAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalCents: true },
    });

    months.push({
      year,
      month,
      targetCents: quota?.targetCents ?? null,
      achievedCents: paidOrders._sum.totalCents || 0,
    });
  }

  return {
    shopId: shop.id,
    rep: {
      id: rep.id,
      name: `${rep.firstName} ${rep.lastName}`,
      email: rep.email,
    },
    months,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const repId = params.repId;

  if (!repId) {
    return { success: false, error: "Rep ID is required" };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { success: false, error: "Shop not found" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "saveQuotas") {
    const quotasJson = formData.get("quotas") as string;

    try {
      const quotas = JSON.parse(quotasJson) as Array<{
        year: number;
        month: number;
        targetCents: number;
      }>;

      const result = await bulkUpsertRepQuotas(shop.id, {
        repId,
        quotas,
      });

      if (result.success) {
        return { success: true, message: `Saved ${result.count} quotas` };
      }
      return { success: false, error: result.error };
    } catch {
      return { success: false, error: "Invalid quota data" };
    }
  }

  return { success: false, error: "Unknown action" };
};

export default function RepQuotaSettingsPage() {
  const { shopId, rep, months } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  // Get unique years from months data
  const availableYears = Array.from(new Set(months.map(m => m.year))).sort();
  const currentYear = new Date().getFullYear();

  // Selected year for pagination
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Track which past months are being edited
  const [editingPastMonths, setEditingPastMonths] = useState<Set<string>>(new Set());

  // Store initial values for dirty checking
  const initialValues = useRef<Map<string, number | null>>(new Map());

  // Current form values
  const [quotaValues, setQuotaValues] = useState<Map<string, string>>(new Map());

  // Toggle edit mode for a past month
  const toggleEditPastMonth = useCallback((key: string) => {
    setEditingPastMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Build full 12-month array for selected year (ensure all months are shown)
  const filteredMonths: MonthData[] = [];
  for (let month = 1; month <= 12; month++) {
    const existing = months.find(m => m.year === selectedYear && m.month === month);
    filteredMonths.push(existing || { year: selectedYear, month, targetCents: null, achievedCents: 0 });
  }

  // Calculate year totals based on current quota values (not just loaded data)
  const yearTotals = filteredMonths.reduce(
    (acc, m) => {
      const key = `${m.year}-${m.month}`;
      const currentQuotaCents = parseDollarsToCents(quotaValues.get(key) || "") || 0;
      return {
        targetCents: acc.targetCents + currentQuotaCents,
        achievedCents: acc.achievedCents + m.achievedCents,
      };
    },
    { targetCents: 0, achievedCents: 0 }
  );

  // Navigation helpers
  const currentYearIndex = availableYears.indexOf(selectedYear);
  const canGoPrev = currentYearIndex > 0;
  const canGoNext = currentYearIndex < availableYears.length - 1;

  const handlePrevYear = () => {
    if (canGoPrev) {
      setSelectedYear(availableYears[currentYearIndex - 1]);
    }
  };

  const handleNextYear = () => {
    if (canGoNext) {
      setSelectedYear(availableYears[currentYearIndex + 1]);
    }
  };

  // Initialize values on mount
  useEffect(() => {
    const initial = new Map<string, number | null>();
    const display = new Map<string, string>();

    for (const m of months) {
      const key = `${m.year}-${m.month}`;
      initial.set(key, m.targetCents);
      display.set(key, centsToDisplayValue(m.targetCents));
    }

    initialValues.current = initial;
    setQuotaValues(display);
  }, [months]);

  // Check if form is dirty
  const isDirty = useCallback(() => {
    for (const [key, currentValue] of quotaValues.entries()) {
      const initialCents = initialValues.current.get(key);
      const currentCents = parseDollarsToCents(currentValue);

      if (initialCents !== currentCents) {
        return true;
      }
    }
    return false;
  }, [quotaValues]);

  // Show/hide save bar based on dirty state
  useEffect(() => {
    if (isDirty()) {
      shopify.saveBar.show("rep-quota-save-bar");
    } else {
      shopify.saveBar.hide("rep-quota-save-bar");
    }
  }, [isDirty, shopify, quotaValues]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      shopify.saveBar.hide("rep-quota-save-bar");

      // Update initial values to current values
      const newInitial = new Map<string, number | null>();
      for (const [key, value] of quotaValues.entries()) {
        newInitial.set(key, parseDollarsToCents(value));
      }
      initialValues.current = newInitial;
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, quotaValues]);

  const handleValueChange = useCallback((year: number, month: number, value: string) => {
    const key = `${year}-${month}`;
    setQuotaValues(prev => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  }, []);

  const handleDiscard = useCallback(() => {
    // Reset to initial values
    const display = new Map<string, string>();
    for (const [key, cents] of initialValues.current.entries()) {
      display.set(key, centsToDisplayValue(cents));
    }
    setQuotaValues(display);
    shopify.saveBar.hide("rep-quota-save-bar");
  }, [shopify]);

  const handleSave = useCallback(() => {
    // Collect all quota values that have been set
    const quotas: Array<{ year: number; month: number; targetCents: number }> = [];

    for (const [key, value] of quotaValues.entries()) {
      const cents = parseDollarsToCents(value);
      if (cents !== null && cents >= 0) {
        const [yearStr, monthStr] = key.split("-");
        quotas.push({
          year: parseInt(yearStr),
          month: parseInt(monthStr),
          targetCents: cents,
        });
      }
    }

    if (quotas.length === 0) {
      shopify.toast.show("No quota values to save", { isError: true });
      return;
    }

    fetcher.submit(
      { _action: "saveQuotas", quotas: JSON.stringify(quotas) },
      { method: "POST" }
    );
  }, [quotaValues, fetcher, shopify]);

  if (!shopId) {
    return (
      <s-page heading="Quota Settings">
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

  if (!rep) {
    return (
      <s-page heading="Quota Settings">
        <s-section>
          <s-stack gap="base">
            <s-heading>Rep Not Found</s-heading>
            <s-paragraph>
              The sales rep could not be found.
            </s-paragraph>
            <s-button onClick={() => navigate("/app/quotas")}>
              Back to Quotas
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <>
      <SaveBar id="rep-quota-save-bar">
        <button variant="primary" onClick={handleSave}></button>
        <button onClick={handleDiscard}></button>
      </SaveBar>

      <s-page heading={`${rep.name}`}>
        <s-link slot="breadcrumb-actions" href="/app/quotas">
          Quotas
        </s-link>
        <s-link slot="secondary-actions" href={`/app/reps/${rep.id}`}>
          View Rep Detail
        </s-link>

        <s-stack gap="base">
          {/* Rep Info */}
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small-300">
              <s-link href={`/app/reps/${rep.id}`}><s-heading>{rep.name}</s-heading></s-link>
              <s-text color="subdued">{rep.email}</s-text>
            </s-stack>
          </s-box>

          {/* Year Navigation */}
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <s-button
                variant="tertiary"
                icon="chevron-left"
                onClick={handlePrevYear}
                disabled={!canGoPrev}
              >
                {canGoPrev ? availableYears[currentYearIndex - 1] : ""}
              </s-button>

              <s-stack gap="small" alignItems="center">
                <s-badge tone="info">
                  <s-heading>{selectedYear}</s-heading>
                </s-badge>
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">
                    Target: {formatCents(yearTotals.targetCents)}
                  </s-text>
                  <s-text color="subdued">
                    Achieved: {formatCents(yearTotals.achievedCents)}
                  </s-text>
                  {yearTotals.targetCents > 0 && (
                    <s-badge
                      tone={
                        yearTotals.achievedCents >= yearTotals.targetCents
                          ? "success"
                          : yearTotals.achievedCents >= yearTotals.targetCents * 0.7
                          ? "warning"
                          : "info"
                      }
                    >
                      {Math.round((yearTotals.achievedCents / yearTotals.targetCents) * 100)}%
                    </s-badge>
                  )}
                </s-stack>
              </s-stack>

              <s-button
                variant="tertiary"
                icon="chevron-right"
                onClick={handleNextYear}
                disabled={!canGoNext}
              >
                {canGoNext ? availableYears[currentYearIndex + 1] : ""}
              </s-button>
            </s-stack>
          </s-box>

          {/* Quota Table */}
          <s-section padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header>Month</s-table-header>
                <s-table-header>Quota</s-table-header>
                <s-table-header>Achieved</s-table-header>
                <s-table-header>Progress</s-table-header>
              </s-table-header-row>

              <s-table-body>

                {filteredMonths.map((m) => {
                  const key = `${m.year}-${m.month}`;
                  const value = quotaValues.get(key) || "";
                  const hasAchievement = m.achievedCents > 0;
                  const isPast = isMonthInPast(m.year, m.month);
                  const currentQuotaCents = parseDollarsToCents(value);
                  const progressPercent = currentQuotaCents && currentQuotaCents > 0
                    ? Math.round((m.achievedCents / currentQuotaCents) * 100)
                    : null;

                  return (
                    <s-table-row key={key}>
                      <s-table-cell>
                        <s-text type="strong">{MONTH_NAMES[m.month - 1]}</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
                          <s-number-field
                            label="Quota"
                            labelAccessibilityVisibility="exclusive"
                            prefix="$"
                            placeholder="0"
                            value={value}
                            min={0}
                            max={99999}
                            autocomplete="off"
                            disabled={isPast && !editingPastMonths.has(key)}
                            onInput={(e: Event) => {
                              const target = e.target as HTMLInputElement;
                              handleValueChange(m.year, m.month, target.value);
                            }}
                          />
                          {isPast && (
                            <s-button
                              variant="tertiary"
                              icon={editingPastMonths.has(key) ? "order-draft" : "edit"}
                              onClick={() => toggleEditPastMonth(key)}
                              accessibilityLabel={editingPastMonths.has(key) ? "Done editing" : "Edit quota"}
                            />
                          )}
                        </s-grid>
                      </s-table-cell>
                      <s-table-cell>
                        {hasAchievement ? formatCents(m.achievedCents) : <s-text color="subdued">-</s-text>}
                      </s-table-cell>
                      <s-table-cell>
                        {progressPercent !== null && hasAchievement ? (
                          <s-badge
                            tone={
                              progressPercent >= 100
                                ? "success"
                                : progressPercent >= 70
                                ? "warning"
                                : "critical"
                            }
                          >
                            {progressPercent}%
                          </s-badge>
                        ) : (
                          <s-text color="subdued">-</s-text>
                        )}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}

              </s-table-body>
            </s-table>
          </s-section>
        </s-stack>
      </s-page>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
