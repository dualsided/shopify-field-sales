import prisma from "../db.server";
import type {
  QuotaProgress,
  QuotaPaceIndicator,
  QuotaListItem,
  QuotaHistoryItem,
} from "@field-sales/shared";

// Re-export types for consumers
export type { QuotaProgress, QuotaPaceIndicator, QuotaListItem, QuotaHistoryItem } from "@field-sales/shared";

// ============================================
// Types
// ============================================

export interface UpsertQuotaInput {
  shopId: string;
  repId: string;
  year: number;
  month: number;
  targetCents: number;
  note?: string;
}

export interface BulkQuotaInput {
  repId: string;
  targetCents: number;
  note?: string;
}

// ============================================
// Helper Functions
// ============================================

function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getDaysElapsed(year: number, month: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    // Past month - all days elapsed
    return getDaysInMonth(year, month);
  } else if (year === currentYear && month === currentMonth) {
    // Current month
    return now.getDate();
  } else {
    // Future month
    return 0;
  }
}

function calculateOnPaceIndicator(
  achievedCents: number,
  targetCents: number,
  daysElapsed: number,
  totalDays: number
): QuotaPaceIndicator {
  if (targetCents === 0 || daysElapsed === 0) return "on_pace";

  const expectedProgress = (daysElapsed / totalDays) * targetCents;
  const ratio = achievedCents / expectedProgress;

  if (ratio >= 1.1) return "ahead";     // 10%+ ahead of pace
  if (ratio >= 0.9) return "on_pace";   // Within 10% of expected
  if (ratio >= 0.7) return "behind";    // 10-30% behind
  return "at_risk";                     // 30%+ behind
}

async function calculateRepRevenue(
  shopId: string,
  repId: string,
  year: number,
  month: number
): Promise<{ achievedCents: number; projectedCents: number }> {
  const { start, end } = getMonthDateRange(year, month);

  const [paidOrders, pendingOrders] = await Promise.all([
    prisma.order.aggregate({
      where: {
        shopId,
        salesRepId: repId,
        status: "PAID",
        placedAt: { gte: start, lte: end },
      },
      _sum: { totalCents: true },
    }),
    prisma.order.aggregate({
      where: {
        shopId,
        salesRepId: repId,
        status: "PENDING",
        placedAt: { gte: start, lte: end },
      },
      _sum: { totalCents: true },
    }),
  ]);

  const achievedCents = paidOrders._sum.totalCents || 0;
  const pendingCents = pendingOrders._sum.totalCents || 0;

  return {
    achievedCents,
    projectedCents: achievedCents + pendingCents,
  };
}

// ============================================
// Queries
// ============================================

/**
 * Get quota progress for a specific rep for a given month.
 * If year/month not provided, defaults to current month.
 */
export async function getRepQuotaProgress(
  shopId: string,
  repId: string,
  year?: number,
  month?: number
): Promise<QuotaProgress> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth() + 1;

  const quota = await prisma.repQuota.findUnique({
    where: {
      shopId_repId_year_month: {
        shopId,
        repId,
        year: targetYear,
        month: targetMonth,
      },
    },
  });

  const { achievedCents, projectedCents } = await calculateRepRevenue(
    shopId,
    repId,
    targetYear,
    targetMonth
  );

  const totalDays = getDaysInMonth(targetYear, targetMonth);
  const daysElapsed = getDaysElapsed(targetYear, targetMonth);
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  if (!quota) {
    return {
      hasQuota: false,
      targetCents: null,
      achievedCents,
      projectedCents,
      progressPercent: 0,
      projectedPercent: 0,
      remainingCents: 0,
      daysRemaining,
      onPaceIndicator: "no_quota",
    };
  }

  const progressPercent = Math.round((achievedCents / quota.targetCents) * 100);
  const projectedPercent = Math.round((projectedCents / quota.targetCents) * 100);
  const remainingCents = Math.max(0, quota.targetCents - achievedCents);

  return {
    hasQuota: true,
    targetCents: quota.targetCents,
    achievedCents,
    projectedCents,
    progressPercent,
    projectedPercent,
    remainingCents,
    daysRemaining,
    onPaceIndicator: calculateOnPaceIndicator(
      achievedCents,
      quota.targetCents,
      daysElapsed,
      totalDays
    ),
  };
}

/**
 * Get all quotas for a specific month with calculated progress.
 */
export async function getMonthlyQuotas(
  shopId: string,
  year: number,
  month: number
): Promise<QuotaListItem[]> {
  const quotas = await prisma.repQuota.findMany({
    where: { shopId, year, month },
    include: {
      salesRep: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { salesRep: { lastName: "asc" } },
  });

  const totalDays = getDaysInMonth(year, month);
  const daysElapsed = getDaysElapsed(year, month);

  const results: QuotaListItem[] = [];

  for (const quota of quotas) {
    const { achievedCents, projectedCents } = await calculateRepRevenue(
      shopId,
      quota.repId,
      year,
      month
    );

    const progressPercent = Math.round((achievedCents / quota.targetCents) * 100);
    const projectedPercent = Math.round((projectedCents / quota.targetCents) * 100);

    results.push({
      id: quota.id,
      repId: quota.repId,
      repName: `${quota.salesRep.firstName} ${quota.salesRep.lastName}`,
      year: quota.year,
      month: quota.month,
      targetCents: quota.targetCents,
      achievedCents,
      projectedCents,
      progressPercent,
      projectedPercent,
      onPaceIndicator: calculateOnPaceIndicator(
        achievedCents,
        quota.targetCents,
        daysElapsed,
        totalDays
      ),
    });
  }

  return results;
}

/**
 * Get quota history for a rep (past N months).
 */
export async function getRepQuotaHistory(
  shopId: string,
  repId: string,
  months: number = 6
): Promise<QuotaHistoryItem[]> {
  const now = new Date();
  const results: QuotaHistoryItem[] = [];

  for (let i = 1; i <= months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const quota = await prisma.repQuota.findUnique({
      where: {
        shopId_repId_year_month: { shopId, repId, year, month },
      },
    });

    if (quota) {
      const { achievedCents } = await calculateRepRevenue(shopId, repId, year, month);
      const progressPercent = Math.round((achievedCents / quota.targetCents) * 100);

      results.push({
        year,
        month,
        targetCents: quota.targetCents,
        achievedCents,
        progressPercent,
      });
    }
  }

  return results;
}

// ============================================
// Mutations
// ============================================

/**
 * Create or update a quota for a rep/month.
 */
export async function upsertQuota(
  input: UpsertQuotaInput
): Promise<{ success: true; quotaId: string } | { success: false; error: string }> {
  const { shopId, repId, year, month, targetCents, note } = input;

  if (targetCents < 0) {
    return { success: false, error: "Target amount cannot be negative" };
  }

  if (month < 1 || month > 12) {
    return { success: false, error: "Month must be between 1 and 12" };
  }

  // Verify rep exists and belongs to shop
  const rep = await prisma.salesRep.findFirst({
    where: { id: repId, shopId },
  });

  if (!rep) {
    return { success: false, error: "Sales rep not found" };
  }

  try {
    const quota = await prisma.repQuota.upsert({
      where: {
        shopId_repId_year_month: { shopId, repId, year, month },
      },
      create: {
        shopId,
        repId,
        year,
        month,
        targetCents,
        note: note || null,
      },
      update: {
        targetCents,
        note: note || null,
      },
    });

    return { success: true, quotaId: quota.id };
  } catch (error) {
    console.error("Error upserting quota:", error);
    return { success: false, error: "Failed to save quota" };
  }
}

/**
 * Bulk create/update quotas for multiple reps.
 */
export async function bulkUpsertQuotas(
  shopId: string,
  year: number,
  month: number,
  quotas: BulkQuotaInput[]
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  if (month < 1 || month > 12) {
    return { success: false, error: "Month must be between 1 and 12" };
  }

  try {
    let count = 0;

    for (const quota of quotas) {
      if (quota.targetCents < 0) continue;

      await prisma.repQuota.upsert({
        where: {
          shopId_repId_year_month: {
            shopId,
            repId: quota.repId,
            year,
            month,
          },
        },
        create: {
          shopId,
          repId: quota.repId,
          year,
          month,
          targetCents: quota.targetCents,
          note: quota.note || null,
        },
        update: {
          targetCents: quota.targetCents,
          note: quota.note || null,
        },
      });
      count++;
    }

    return { success: true, count };
  } catch (error) {
    console.error("Error bulk upserting quotas:", error);
    return { success: false, error: "Failed to save quotas" };
  }
}

/**
 * Copy quotas from one month to another.
 */
export async function copyQuotasToMonth(
  shopId: string,
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  try {
    const sourceQuotas = await prisma.repQuota.findMany({
      where: { shopId, year: fromYear, month: fromMonth },
    });

    if (sourceQuotas.length === 0) {
      return { success: false, error: "No quotas found for source month" };
    }

    let count = 0;

    for (const quota of sourceQuotas) {
      await prisma.repQuota.upsert({
        where: {
          shopId_repId_year_month: {
            shopId,
            repId: quota.repId,
            year: toYear,
            month: toMonth,
          },
        },
        create: {
          shopId,
          repId: quota.repId,
          year: toYear,
          month: toMonth,
          targetCents: quota.targetCents,
          note: quota.note,
        },
        update: {
          targetCents: quota.targetCents,
          note: quota.note,
        },
      });
      count++;
    }

    return { success: true, count };
  } catch (error) {
    console.error("Error copying quotas:", error);
    return { success: false, error: "Failed to copy quotas" };
  }
}

/**
 * Delete a quota.
 */
export async function deleteQuota(
  shopId: string,
  quotaId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const quota = await prisma.repQuota.findFirst({
      where: { id: quotaId, shopId },
    });

    if (!quota) {
      return { success: false, error: "Quota not found" };
    }

    await prisma.repQuota.delete({
      where: { id: quotaId },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting quota:", error);
    return { success: false, error: "Failed to delete quota" };
  }
}
