import { prisma } from "@field-sales/database";
import type {
  QuotaProgress,
  QuotaPaceIndicator,
  QuotaListItem,
  QuotaHistoryItem,
  RunRateProjection,
  YoYComparison,
  TrendAnalysis,
  TrendDirection,
  ConfidenceLevel,
  RepForecast,
  MultiMonthQuotaItem,
  MonthQuotaData,
  BulkMultiMonthQuotaInput,
} from "@field-sales/shared";

// Re-export types for consumers
export type {
  QuotaProgress,
  QuotaPaceIndicator,
  QuotaListItem,
  QuotaHistoryItem,
  RunRateProjection,
  YoYComparison,
  TrendAnalysis,
  TrendDirection,
  ConfidenceLevel,
  RepForecast,
  MultiMonthQuotaItem,
  MonthQuotaData,
  BulkMultiMonthQuotaInput,
} from "@field-sales/shared";

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

// ============================================
// Forecasting Functions
// ============================================

/**
 * Calculate run-rate projection for current month.
 * Projects achievement to end of month based on daily rate.
 */
export async function calculateRunRateProjection(
  shopId: string,
  repId: string,
  targetCents: number
): Promise<RunRateProjection> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { achievedCents } = await calculateRepRevenue(shopId, repId, year, month);
  const totalDays = getDaysInMonth(year, month);
  const daysElapsed = getDaysElapsed(year, month);

  // Avoid division by zero
  const dailyRate = daysElapsed > 0 ? achievedCents / daysElapsed : 0;
  const projectedEndOfMonthCents = Math.round(dailyRate * totalDays);

  return {
    currentAchievedCents: achievedCents,
    daysElapsed,
    totalDays,
    projectedEndOfMonthCents,
    gapToQuotaCents: targetCents - projectedEndOfMonthCents,
    onTrackPercent: targetCents > 0
      ? Math.round((projectedEndOfMonthCents / targetCents) * 100)
      : 0,
  };
}

/**
 * Get year-over-year comparison for a given month.
 */
export async function getYoYComparison(
  shopId: string,
  repId: string,
  year: number,
  month: number
): Promise<YoYComparison> {
  const lastYear = year - 1;

  // Get current year quota and achievement
  const [currentQuota, currentRevenue] = await Promise.all([
    prisma.repQuota.findUnique({
      where: {
        shopId_repId_year_month: { shopId, repId, year, month },
      },
    }),
    calculateRepRevenue(shopId, repId, year, month),
  ]);

  // Get last year quota and achievement
  const [lastYearQuota, lastYearRevenue] = await Promise.all([
    prisma.repQuota.findUnique({
      where: {
        shopId_repId_year_month: { shopId, repId, year: lastYear, month },
      },
    }),
    calculateRepRevenue(shopId, repId, lastYear, month),
  ]);

  // Calculate growth percentages
  let targetGrowthPercent: number | null = null;
  if (currentQuota && lastYearQuota && lastYearQuota.targetCents > 0) {
    targetGrowthPercent = Math.round(
      ((currentQuota.targetCents - lastYearQuota.targetCents) / lastYearQuota.targetCents) * 100
    );
  }

  let achievementGrowthPercent: number | null = null;
  if (lastYearRevenue.achievedCents > 0) {
    achievementGrowthPercent = Math.round(
      ((currentRevenue.achievedCents - lastYearRevenue.achievedCents) / lastYearRevenue.achievedCents) * 100
    );
  }

  return {
    currentYear: year,
    currentMonth: month,
    currentTargetCents: currentQuota?.targetCents ?? null,
    currentAchievedCents: currentRevenue.achievedCents,
    lastYear,
    lastYearTargetCents: lastYearQuota?.targetCents ?? null,
    lastYearAchievedCents: lastYearRevenue.achievedCents,
    targetGrowthPercent,
    achievementGrowthPercent,
  };
}

/**
 * Analyze historical trends to predict future performance.
 * Uses past N months of data.
 */
export async function analyzeTrend(
  shopId: string,
  repId: string,
  lookbackMonths: number = 12
): Promise<TrendAnalysis> {
  const history = await getRepQuotaHistory(shopId, repId, lookbackMonths);

  // Not enough data for trend analysis
  if (history.length < 3) {
    // Get at least some revenue data even without quotas
    const now = new Date();
    let totalAchieved = 0;
    let monthsWithData = 0;

    for (let i = 1; i <= Math.min(lookbackMonths, 6); i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const { achievedCents } = await calculateRepRevenue(
        shopId,
        repId,
        date.getFullYear(),
        date.getMonth() + 1
      );
      if (achievedCents > 0) {
        totalAchieved += achievedCents;
        monthsWithData++;
      }
    }

    const avgAchievement = monthsWithData > 0 ? Math.round(totalAchieved / monthsWithData) : 0;

    return {
      monthsAnalyzed: history.length,
      averageAchievementCents: avgAchievement,
      averageAttainmentPercent: 0,
      trend: "stable" as TrendDirection,
      predictedNextMonthCents: avgAchievement,
      confidenceLevel: "low" as ConfidenceLevel,
    };
  }

  // Calculate averages
  const totalAchieved = history.reduce((sum, h) => sum + h.achievedCents, 0);
  const totalAttainment = history.reduce((sum, h) => sum + h.progressPercent, 0);

  // Simple trend detection: compare first half to second half
  const midpoint = Math.floor(history.length / 2);
  const firstHalfAvg =
    history.slice(0, midpoint).reduce((s, h) => s + h.progressPercent, 0) / midpoint;
  const secondHalfAvg =
    history.slice(midpoint).reduce((s, h) => s + h.progressPercent, 0) / (history.length - midpoint);

  let trend: TrendDirection;
  if (secondHalfAvg > firstHalfAvg * 1.1) {
    trend = "improving";
  } else if (secondHalfAvg < firstHalfAvg * 0.9) {
    trend = "declining";
  } else {
    trend = "stable";
  }

  // Simple moving average prediction (last 3 months)
  const recentMonths = history.slice(0, 3);
  const predictedNextMonthCents = Math.round(
    recentMonths.reduce((s, h) => s + h.achievedCents, 0) / recentMonths.length
  );

  // Confidence based on data availability
  let confidenceLevel: ConfidenceLevel;
  if (history.length >= 12) {
    confidenceLevel = "high";
  } else if (history.length >= 6) {
    confidenceLevel = "medium";
  } else {
    confidenceLevel = "low";
  }

  return {
    monthsAnalyzed: history.length,
    averageAchievementCents: Math.round(totalAchieved / history.length),
    averageAttainmentPercent: Math.round(totalAttainment / history.length),
    trend,
    predictedNextMonthCents,
    confidenceLevel,
  };
}

/**
 * Get comprehensive forecast for a single rep.
 */
export async function getRepForecast(
  shopId: string,
  repId: string,
  year: number,
  month: number
): Promise<RepForecast> {
  // Get rep name
  const rep = await prisma.salesRep.findUnique({
    where: { id: repId },
    select: { firstName: true, lastName: true },
  });

  const repName = rep ? `${rep.firstName} ${rep.lastName}` : "Unknown";

  // Get all forecast data in parallel
  const [quota, yoy, trend] = await Promise.all([
    getRepQuotaProgress(shopId, repId, year, month),
    getYoYComparison(shopId, repId, year, month),
    analyzeTrend(shopId, repId, 12),
  ]);

  // Run-rate only makes sense for current month
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  let runRate: RunRateProjection | null = null;

  if (isCurrentMonth && quota.hasQuota && quota.targetCents) {
    runRate = await calculateRunRateProjection(shopId, repId, quota.targetCents);
  }

  return {
    repId,
    repName,
    year,
    month,
    quota,
    runRate,
    yoy,
    trend,
  };
}

/**
 * Get forecasts for all reps with quotas for a given month.
 */
export async function getMonthlyForecasts(
  shopId: string,
  year: number,
  month: number
): Promise<RepForecast[]> {
  // Get all quotas for the month
  const quotas = await prisma.repQuota.findMany({
    where: { shopId, year, month },
    include: {
      salesRep: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { salesRep: { lastName: "asc" } },
  });

  // Build forecasts for each rep
  const forecasts: RepForecast[] = [];

  for (const quota of quotas) {
    const forecast = await getRepForecast(shopId, quota.repId, year, month);
    forecasts.push(forecast);
  }

  return forecasts;
}

// ============================================
// Multi-Month Planning Functions
// ============================================

/**
 * Helper to generate array of months between two dates.
 */
function generateMonthRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
}

/**
 * Get quotas for a single rep across a date range.
 */
export async function getRepQuotasForDateRange(
  shopId: string,
  repId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<MultiMonthQuotaItem> {
  const rep = await prisma.salesRep.findUnique({
    where: { id: repId },
    select: { firstName: true, lastName: true },
  });

  const repName = rep ? `${rep.firstName} ${rep.lastName}` : "Unknown";
  const monthRange = generateMonthRange(startYear, startMonth, endYear, endMonth);

  // Fetch all quotas for this rep in the range
  const quotas = await prisma.repQuota.findMany({
    where: {
      shopId,
      repId,
      OR: monthRange.map(({ year, month }) => ({ year, month })),
    },
  });

  const quotaMap = new Map(quotas.map(q => [`${q.year}-${q.month}`, q]));

  // Build month data including last year comparison
  const months: MonthQuotaData[] = [];

  for (const { year, month } of monthRange) {
    const quota = quotaMap.get(`${year}-${month}`);
    const { achievedCents } = await calculateRepRevenue(shopId, repId, year, month);

    // Get last year data
    const lastYear = year - 1;
    const lastYearQuota = await prisma.repQuota.findUnique({
      where: {
        shopId_repId_year_month: { shopId, repId, year: lastYear, month },
      },
    });
    const lastYearRevenue = await calculateRepRevenue(shopId, repId, lastYear, month);

    months.push({
      year,
      month,
      targetCents: quota?.targetCents ?? null,
      achievedCents,
      progressPercent: quota ? Math.round((achievedCents / quota.targetCents) * 100) : null,
      lastYearTargetCents: lastYearQuota?.targetCents ?? null,
      lastYearAchievedCents: lastYearRevenue.achievedCents,
    });
  }

  return {
    repId,
    repName,
    months,
  };
}

/**
 * Get quotas for all reps across a date range.
 */
export async function getAllRepsQuotasForDateRange(
  shopId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<MultiMonthQuotaItem[]> {
  // Get all active reps
  const reps = await prisma.salesRep.findMany({
    where: { shopId, isActive: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
  });

  const results: MultiMonthQuotaItem[] = [];

  for (const rep of reps) {
    const repData = await getRepQuotasForDateRange(
      shopId,
      rep.id,
      startYear,
      startMonth,
      endYear,
      endMonth
    );
    results.push(repData);
  }

  return results;
}

/**
 * Bulk upsert quotas for a single rep across multiple months.
 */
export async function bulkUpsertRepQuotas(
  shopId: string,
  input: BulkMultiMonthQuotaInput
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const { repId, quotas } = input;

  // Verify rep exists
  const rep = await prisma.salesRep.findFirst({
    where: { id: repId, shopId },
  });

  if (!rep) {
    return { success: false, error: "Sales rep not found" };
  }

  try {
    let count = 0;

    for (const quota of quotas) {
      if (quota.targetCents < 0) continue;
      if (quota.month < 1 || quota.month > 12) continue;

      await prisma.repQuota.upsert({
        where: {
          shopId_repId_year_month: {
            shopId,
            repId,
            year: quota.year,
            month: quota.month,
          },
        },
        create: {
          shopId,
          repId,
          year: quota.year,
          month: quota.month,
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
    console.error("Error bulk upserting rep quotas:", error);
    return { success: false, error: "Failed to save quotas" };
  }
}

/**
 * Apply growth rate to existing quotas in a date range.
 * E.g., "Increase all Q2 quotas by 10%"
 */
export async function applyGrowthRateToQuotas(
  shopId: string,
  repId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
  growthPercent: number
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const monthRange = generateMonthRange(startYear, startMonth, endYear, endMonth);

  try {
    let count = 0;
    const multiplier = 1 + growthPercent / 100;

    for (const { year, month } of monthRange) {
      const existing = await prisma.repQuota.findUnique({
        where: {
          shopId_repId_year_month: { shopId, repId, year, month },
        },
      });

      if (existing) {
        const newTarget = Math.round(existing.targetCents * multiplier);

        await prisma.repQuota.update({
          where: { id: existing.id },
          data: { targetCents: newTarget },
        });
        count++;
      }
    }

    return { success: true, count };
  } catch (error) {
    console.error("Error applying growth rate:", error);
    return { success: false, error: "Failed to apply growth rate" };
  }
}

/**
 * Copy quotas from last year with optional growth rate.
 */
export async function copyQuotasFromLastYear(
  shopId: string,
  repId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
  growthPercent: number = 0
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const monthRange = generateMonthRange(startYear, startMonth, endYear, endMonth);

  try {
    let count = 0;
    const multiplier = 1 + growthPercent / 100;

    for (const { year, month } of monthRange) {
      // Get last year's quota
      const lastYearQuota = await prisma.repQuota.findUnique({
        where: {
          shopId_repId_year_month: { shopId, repId, year: year - 1, month },
        },
      });

      if (lastYearQuota) {
        const newTarget = Math.round(lastYearQuota.targetCents * multiplier);

        await prisma.repQuota.upsert({
          where: {
            shopId_repId_year_month: { shopId, repId, year, month },
          },
          create: {
            shopId,
            repId,
            year,
            month,
            targetCents: newTarget,
            note: `Copied from ${year - 1}${growthPercent !== 0 ? ` (+${growthPercent}%)` : ""}`,
          },
          update: {
            targetCents: newTarget,
            note: `Copied from ${year - 1}${growthPercent !== 0 ? ` (+${growthPercent}%)` : ""}`,
          },
        });
        count++;
      }
    }

    if (count === 0) {
      return { success: false, error: "No quotas found from last year" };
    }

    return { success: true, count };
  } catch (error) {
    console.error("Error copying quotas from last year:", error);
    return { success: false, error: "Failed to copy quotas" };
  }
}
