import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { prisma } from "@field-sales/database";
import { bulkUpsertQuotas } from "../services/quota.server";
import { getActiveSalesReps } from "../services/salesRep.server";

interface RepWithQuota {
  id: string;
  name: string;
  currentQuota: number | null; // in cents
  note: string | null;
}

interface LoaderData {
  reps: RepWithQuota[];
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
  const year = parseInt(url.searchParams.get("year") || String(now.getFullYear()));
  const month = parseInt(url.searchParams.get("month") || String(now.getMonth() + 1));

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { reps: [], year, month, shopId: null };
  }

  // Get active reps
  const activeReps = await getActiveSalesReps(shop.id);

  // Get existing quotas for this month
  const existingQuotas = await prisma.repQuota.findMany({
    where: { shopId: shop.id, year, month },
  });

  const quotaMap = new Map(existingQuotas.map(q => [q.repId, q]));

  const reps: RepWithQuota[] = activeReps.map(rep => {
    const quota = quotaMap.get(rep.id);
    return {
      id: rep.id,
      name: rep.name,
      currentQuota: quota?.targetCents ?? null,
      note: quota?.note ?? null,
    };
  });

  return {
    reps,
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

  if (actionType === "saveAll") {
    const year = parseInt(formData.get("year") as string);
    const month = parseInt(formData.get("month") as string);
    const quotasJson = formData.get("quotas") as string;

    let quotas: Array<{ repId: string; targetCents: number; note?: string }>;
    try {
      quotas = JSON.parse(quotasJson);
    } catch {
      return { success: false, error: "Invalid quota data" };
    }

    // Filter out any with 0 or negative values (they don't want a quota)
    const validQuotas = quotas.filter(q => q.targetCents > 0);

    if (validQuotas.length === 0) {
      return { success: false, error: "No valid quotas to save" };
    }

    const result = await bulkUpsertQuotas(shop.id, year, month, validQuotas);

    if (result.success) {
      return { success: true, message: `Saved ${result.count} quotas` };
    }
    return { success: false, error: result.error };
  }

  if (actionType === "applyToAll") {
    // This just returns success - the actual application happens client-side
    return { success: true };
  }

  return { success: false, error: "Unknown action" };
};

export default function QuotasManagePage() {
  const { reps, year, month, shopId } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  // Track quota values for each rep
  const [quotaValues, setQuotaValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const rep of reps) {
      initial[rep.id] = centsToDollars(rep.currentQuota);
    }
    return initial;
  });

  const [applyAllValue, setApplyAllValue] = useState("");

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      // Navigate back to list after successful save
      navigate(`/app/quotas?year=${year}&month=${month}`);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate, year, month]);

  const handleQuotaChange = (repId: string, value: string) => {
    // Allow only numbers
    const cleaned = value.replace(/[^0-9]/g, "");
    setQuotaValues(prev => ({ ...prev, [repId]: cleaned }));
  };

  const handleApplyToAll = () => {
    if (!applyAllValue) return;
    const newValues: Record<string, string> = {};
    for (const rep of reps) {
      newValues[rep.id] = applyAllValue;
    }
    setQuotaValues(newValues);
  };

  const handleSave = () => {
    const quotas = reps.map(rep => ({
      repId: rep.id,
      targetCents: dollarsToCents(quotaValues[rep.id] || "0"),
    }));

    fetcher.submit(
      {
        _action: "saveAll",
        year: String(year),
        month: String(month),
        quotas: JSON.stringify(quotas),
      },
      { method: "POST" }
    );
  };

  if (!shopId) {
    return (
      <s-page heading="Set Quotas">
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

  if (reps.length === 0) {
    return (
      <s-page heading="Set Quotas">
        <s-section>
          <s-stack gap="base">
            <s-heading>No Active Sales Reps</s-heading>
            <s-paragraph>
              You need to add active sales reps before setting quotas.
            </s-paragraph>
            <s-button onClick={() => navigate("/app/reps")}>
              Manage Sales Reps
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const totalTarget = reps.reduce((sum, rep) => {
    return sum + dollarsToCents(quotaValues[rep.id] || "0");
  }, 0);

  const repsWithQuotas = reps.filter(rep => {
    const value = quotaValues[rep.id];
    return value && parseInt(value) > 0;
  }).length;

  return (
    <s-page heading={`Set Quotas - ${MONTH_NAMES[month - 1]} ${year}`}>
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save All
      </s-button>
      <s-link slot="secondary-actions" href={`/app/quotas?year=${year}&month=${month}`}>
        Cancel
      </s-link>
      <s-link slot="secondary-actions" href="/app/quotas/plan">
        Plan Multiple Months
      </s-link>

      <s-box paddingBlock="base">
        <s-paragraph>
          Set monthly revenue targets for each sales rep. Enter amounts in dollars.
        </s-paragraph>
      </s-box>

      {/* Apply to All */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Quick Set</s-heading>
          <s-grid gap="base" gridTemplateColumns="1fr auto">
            <s-text-field
              label="Apply amount to all reps"
              value={applyAllValue}
              prefix="$"
              onInput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                setApplyAllValue(target.value.replace(/[^0-9]/g, ""));
              }}
            />
            <s-box paddingBlockStart="base">
              <s-button variant="secondary" onClick={handleApplyToAll}>
                Apply to All
              </s-button>
            </s-box>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Summary */}
      <s-section>
        <s-grid gap="base" gridTemplateColumns="1fr 1fr">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="none">
              <s-text color="subdued">Reps with Quotas</s-text>
              <s-heading>{repsWithQuotas} / {reps.length}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="none">
              <s-text color="subdued">Total Target</s-text>
              <s-heading>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(totalTarget / 100)}
              </s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Individual Rep Quotas */}
      <s-section>
        <s-stack gap="base">
          <s-heading>Individual Quotas</s-heading>
          <s-table>
            <s-table-header-row>
              <s-table-header>Sales Rep</s-table-header>
              <s-table-header>Target Amount</s-table-header>
              <s-table-header>Current</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {reps.map((rep) => (
                <s-table-row key={rep.id}>
                  <s-table-cell>{rep.name}</s-table-cell>
                  <s-table-cell>
                    <s-text-field
                      label="Target"
                      value={quotaValues[rep.id] || ""}
                      prefix="$"
                      onInput={(e: Event) => {
                        const target = e.target as HTMLInputElement;
                        handleQuotaChange(rep.id, target.value);
                      }}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    {rep.currentQuota !== null ? (
                      <s-text color="subdued">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(rep.currentQuota / 100)}
                      </s-text>
                    ) : (
                      <s-text color="subdued">Not set</s-text>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
