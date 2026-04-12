import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "@field-sales/database";
import {
  getMonthlyForecasts,
  type RepForecast,
} from "../services/quota.server";

interface LoaderData {
  shopId: string | null;
  year: number;
  month: number;
  forecasts: RepForecast[];
  teamTotals: {
    totalTargetCents: number;
    totalAchievedCents: number;
    totalProjectedCents: number;
    teamOnTrackPercent: number;
    repsOnTrack: number;
    repsAtRisk: number;
    totalReps: number;
  };
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

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value}%`;
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
    case "no_quota": return "No Quota";
    default: return "";
  }
}

function getTrendColor(trend: string): "success" | "info" | "critical" {
  switch (trend) {
    case "improving": return "success";
    case "stable": return "info";
    case "declining": return "critical";
    default: return "info";
  }
}

function getTrendLabel(trend: string): string {
  switch (trend) {
    case "improving": return "Improving";
    case "stable": return "Stable";
    case "declining": return "Declining";
    default: return "";
  }
}

function getConfidenceLabel(level: string): string {
  switch (level) {
    case "high": return "High";
    case "medium": return "Medium";
    case "low": return "Low";
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
    return {
      shopId: null,
      year,
      month,
      forecasts: [],
      teamTotals: {
        totalTargetCents: 0,
        totalAchievedCents: 0,
        totalProjectedCents: 0,
        teamOnTrackPercent: 0,
        repsOnTrack: 0,
        repsAtRisk: 0,
        totalReps: 0,
      },
    };
  }

  const forecasts = await getMonthlyForecasts(shop.id, year, month);

  // Calculate team totals
  let totalTargetCents = 0;
  let totalAchievedCents = 0;
  let totalProjectedCents = 0;
  let repsOnTrack = 0;
  let repsAtRisk = 0;

  for (const f of forecasts) {
    if (f.quota.hasQuota && f.quota.targetCents) {
      totalTargetCents += f.quota.targetCents;
      totalAchievedCents += f.quota.achievedCents;
      totalProjectedCents += f.runRate?.projectedEndOfMonthCents || f.quota.projectedCents;

      if (f.quota.onPaceIndicator === "ahead" || f.quota.onPaceIndicator === "on_pace") {
        repsOnTrack++;
      } else if (f.quota.onPaceIndicator === "at_risk") {
        repsAtRisk++;
      }
    }
  }

  const teamOnTrackPercent = totalTargetCents > 0
    ? Math.round((totalProjectedCents / totalTargetCents) * 100)
    : 0;

  return {
    shopId: shop.id,
    year,
    month,
    forecasts,
    teamTotals: {
      totalTargetCents,
      totalAchievedCents,
      totalProjectedCents,
      teamOnTrackPercent,
      repsOnTrack,
      repsAtRisk,
      totalReps: forecasts.length,
    },
  };
};

export default function QuotasForecastPage() {
  const {
    shopId,
    year,
    month,
    forecasts,
    teamTotals,
  } = useLoaderData<LoaderData>();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);

  const currentYear = new Date().getFullYear();
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const handlePeriodChange = () => {
    setSearchParams({
      year: String(selectedYear),
      month: String(selectedMonth),
    });
  };

  if (!shopId) {
    return (
      <s-page heading="Quota Forecasts">
        <s-section>
          <s-stack gap="base">
            <s-heading>Setup Required</s-heading>
            <s-paragraph>
              Your store needs to complete setup before viewing forecasts.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={`Quota Forecasts - ${MONTH_NAMES[month - 1]} ${year}`}>
      <s-link slot="secondary-actions" href="/app/quotas">
        Back to Quotas
      </s-link>
      <s-link slot="secondary-actions" href="/app/quotas/plan">
        Multi-Month Planning
      </s-link>

      <s-box paddingBlock="base">
        <s-paragraph>
          View projections and forecasts for your sales team.
          {isCurrentMonth && " Run-rate projections are based on current month performance."}
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
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                <s-option key={y} value={String(y)}>{y}</s-option>
              ))}
            </s-select>
            <s-box paddingBlockStart="base">
              <s-button onClick={handlePeriodChange}>View</s-button>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Team Summary Cards */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Team Summary</s-heading>
          <s-grid gap="base" gridTemplateColumns="1fr 1fr 1fr 1fr">
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Team Target</s-text>
                <s-heading>{formatCents(teamTotals.totalTargetCents)}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Achieved</s-text>
                <s-heading>{formatCents(teamTotals.totalAchievedCents)}</s-heading>
                <s-text color="subdued">
                  {teamTotals.totalTargetCents > 0
                    ? `${Math.round((teamTotals.totalAchievedCents / teamTotals.totalTargetCents) * 100)}%`
                    : "-"}
                </s-text>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Projected EOM</s-text>
                <s-heading>{formatCents(teamTotals.totalProjectedCents)}</s-heading>
                <s-badge tone={teamTotals.teamOnTrackPercent >= 100 ? "success" : "critical"}>
                  {teamTotals.teamOnTrackPercent}% of target
                </s-badge>
              </s-stack>
            </s-box>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="none">
                <s-text color="subdued">Rep Status</s-text>
                <s-stack direction="inline" gap="small">
                  <s-badge tone="success">{teamTotals.repsOnTrack} On Track</s-badge>
                  <s-badge tone="critical">{teamTotals.repsAtRisk} At Risk</s-badge>
                </s-stack>
                <s-text color="subdued">{teamTotals.totalReps} total reps</s-text>
              </s-stack>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Rep Forecast Table */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Rep-by-Rep Forecast</s-heading>
          {forecasts.length === 0 ? (
            <s-banner tone="info">
              No quotas set for {MONTH_NAMES[month - 1]} {year}.
              <s-box paddingBlockStart="small">
                <s-button variant="secondary" onClick={() => navigate(`/app/quotas/manage?year=${year}&month=${month}`)}>
                  Set Quotas
                </s-button>
              </s-box>
            </s-banner>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <s-table>
                <s-table-header-row>
                  <s-table-header>Sales Rep</s-table-header>
                  <s-table-header>Target</s-table-header>
                  <s-table-header>Achieved</s-table-header>
                  {isCurrentMonth && <s-table-header>Run Rate</s-table-header>}
                  <s-table-header>Projected</s-table-header>
                  <s-table-header>Gap</s-table-header>
                  <s-table-header>vs LY</s-table-header>
                  <s-table-header>Trend</s-table-header>
                  <s-table-header>Status</s-table-header>
                </s-table-header-row>

                <s-table-body>
                  {forecasts.map((forecast) => {
                    const projectedEOM = forecast.runRate?.projectedEndOfMonthCents
                      || forecast.quota.projectedCents;
                    const gap = (forecast.quota.targetCents || 0) - projectedEOM;

                    return (
                      <s-table-row
                        key={forecast.repId}
                        clickDelegate={`rep-link-${forecast.repId}`}
                      >
                        <s-table-cell>
                          <s-link
                            id={`rep-link-${forecast.repId}`}
                            onClick={() => navigate(`/app/reps/${forecast.repId}`)}
                          >
                            {forecast.repName}
                          </s-link>
                        </s-table-cell>
                        <s-table-cell>
                          {formatCents(forecast.quota.targetCents || 0)}
                        </s-table-cell>
                        <s-table-cell>
                          {formatCents(forecast.quota.achievedCents)}
                        </s-table-cell>
                        {isCurrentMonth && (
                          <s-table-cell>
                            {forecast.runRate ? (
                              <s-text color="subdued">
                                {formatCents(forecast.runRate.projectedEndOfMonthCents)}/mo
                              </s-text>
                            ) : (
                              <s-text color="subdued">-</s-text>
                            )}
                          </s-table-cell>
                        )}
                        <s-table-cell>
                          <s-badge tone={projectedEOM >= (forecast.quota.targetCents || 0) ? "success" : "warning"}>
                            {formatCents(projectedEOM)}
                          </s-badge>
                        </s-table-cell>
                        <s-table-cell>
                          <s-badge tone={gap <= 0 ? "success" : "critical"}>
                            {gap <= 0 ? "+" : "-"}{formatCents(Math.abs(gap))}
                          </s-badge>
                        </s-table-cell>
                        <s-table-cell>
                          {forecast.yoy.achievementGrowthPercent !== null ? (
                            <s-badge tone={forecast.yoy.achievementGrowthPercent >= 0 ? "success" : "critical"}>
                              {formatPercent(forecast.yoy.achievementGrowthPercent)}
                            </s-badge>
                          ) : (
                            <s-text color="subdued">-</s-text>
                          )}
                        </s-table-cell>
                        <s-table-cell>
                          <s-badge tone={getTrendColor(forecast.trend.trend)}>
                            {getTrendLabel(forecast.trend.trend)}
                          </s-badge>
                          {forecast.trend.confidenceLevel !== "high" && (
                            <s-text color="subdued">
                              ({getConfidenceLabel(forecast.trend.confidenceLevel)})
                            </s-text>
                          )}
                        </s-table-cell>
                        <s-table-cell>
                          <s-badge tone={getPaceColor(forecast.quota.onPaceIndicator)}>
                            {getPaceLabel(forecast.quota.onPaceIndicator)}
                          </s-badge>
                        </s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            </div>
          )}
        </s-stack>
      </s-section>

      {/* Forecast Legend */}
      <s-section>
        <s-stack gap="small">
          <s-heading>Understanding Forecasts</s-heading>
          <s-grid gap="base" gridTemplateColumns="1fr 1fr">
            <s-box>
              <s-stack gap="small">
                <s-text type="strong">Run Rate</s-text>
                <s-text color="subdued">
                  Projects current month's achievement to end of month based on daily average.
                  Only shown for the current month.
                </s-text>
              </s-stack>
            </s-box>
            <s-box>
              <s-stack gap="small">
                <s-text type="strong">Trend</s-text>
                <s-text color="subdued">
                  Based on the past 6-12 months of quota attainment.
                  Compares recent performance to earlier periods.
                </s-text>
              </s-stack>
            </s-box>
            <s-box>
              <s-stack gap="small">
                <s-text type="strong">vs LY (Year-over-Year)</s-text>
                <s-text color="subdued">
                  Compares current achievement to the same month last year.
                </s-text>
              </s-stack>
            </s-box>
            <s-box>
              <s-stack gap="small">
                <s-text type="strong">Status</s-text>
                <s-text color="subdued">
                  Ahead (10%+ ahead), On Pace (within 10%), Behind (10-30% behind), At Risk (30%+ behind).
                </s-text>
              </s-stack>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
