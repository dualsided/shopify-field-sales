/**
 * Quota Types
 *
 * Types for sales rep revenue quota tracking.
 * Achievement is calculated on-demand from orders (not stored).
 */

export type QuotaPaceIndicator = 'ahead' | 'on_pace' | 'behind' | 'at_risk' | 'no_quota';

/**
 * Quota progress for a sales rep for a given period.
 * Achievement values are calculated on-demand from orders.
 */
export interface QuotaProgress {
  hasQuota: boolean;
  targetCents: number | null;
  achievedCents: number;       // Sum of PAID orders
  projectedCents: number;      // Sum of PAID + PENDING orders
  progressPercent: number;     // achievedCents / targetCents * 100
  projectedPercent: number;    // projectedCents / targetCents * 100
  remainingCents: number;      // targetCents - achievedCents
  daysRemaining: number;       // Days left in period
  onPaceIndicator: QuotaPaceIndicator;
}

/**
 * Quota definition for a sales rep.
 * Only stores the target - achievement is calculated from orders.
 */
export interface RepQuota {
  id: string;
  shopId: string;
  repId: string;
  year: number;
  month: number;
  targetCents: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Quota list item with calculated progress.
 * Used for displaying all quotas for a given month.
 */
export interface QuotaListItem {
  id: string;
  repId: string;
  repName: string;
  year: number;
  month: number;
  targetCents: number;
  achievedCents: number;
  projectedCents: number;
  progressPercent: number;
  projectedPercent: number;
  onPaceIndicator: QuotaPaceIndicator;
}

/**
 * Historical quota performance for a period.
 * Calculated on-demand from orders.
 */
export interface QuotaHistoryItem {
  year: number;
  month: number;
  targetCents: number;
  achievedCents: number;
  progressPercent: number;
}

/**
 * Request to create or update a quota.
 */
export interface UpsertQuotaRequest {
  repId: string;
  year: number;
  month: number;
  targetCents: number;
  note?: string;
}

/**
 * Request to bulk create quotas for multiple reps.
 */
export interface BulkCreateQuotasRequest {
  year: number;
  month: number;
  quotas: Array<{
    repId: string;
    targetCents: number;
    note?: string;
  }>;
}

// ============================================
// Forecasting Types
// ============================================

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Run-rate projection for current month.
 * Projects achievement to end of month based on daily rate.
 */
export interface RunRateProjection {
  currentAchievedCents: number;
  daysElapsed: number;
  totalDays: number;
  projectedEndOfMonthCents: number;  // (achieved / daysElapsed) * totalDays
  gapToQuotaCents: number;           // targetCents - projectedEndOfMonthCents
  onTrackPercent: number;            // projectedEndOfMonthCents / targetCents * 100
}

/**
 * Year-over-year comparison for a given month.
 */
export interface YoYComparison {
  currentYear: number;
  currentMonth: number;
  currentTargetCents: number | null;
  currentAchievedCents: number;
  lastYear: number;
  lastYearTargetCents: number | null;
  lastYearAchievedCents: number;
  targetGrowthPercent: number | null;      // (currentTarget - lastYearTarget) / lastYearTarget * 100
  achievementGrowthPercent: number | null; // (currentAchieved - lastYearAchieved) / lastYearAchieved * 100
}

/**
 * Trend analysis based on historical performance.
 */
export interface TrendAnalysis {
  monthsAnalyzed: number;
  averageAchievementCents: number;
  averageAttainmentPercent: number;  // avg(achieved/target) across months with quotas
  trend: TrendDirection;
  predictedNextMonthCents: number;   // Simple moving average prediction
  confidenceLevel: ConfidenceLevel;
}

/**
 * Combined forecast data for a sales rep.
 */
export interface RepForecast {
  repId: string;
  repName: string;
  year: number;
  month: number;
  quota: QuotaProgress;
  runRate: RunRateProjection | null;  // Only for current month
  yoy: YoYComparison;
  trend: TrendAnalysis;
}

// ============================================
// Multi-Month Planning Types
// ============================================

/**
 * Month data for multi-month planning grid.
 */
export interface MonthQuotaData {
  year: number;
  month: number;
  targetCents: number | null;
  achievedCents: number;           // For past/current months
  progressPercent: number | null;  // Only if targetCents is set
  lastYearTargetCents: number | null;
  lastYearAchievedCents: number;
}

/**
 * Multi-month quota grid item for a single rep.
 */
export interface MultiMonthQuotaItem {
  repId: string;
  repName: string;
  months: MonthQuotaData[];
}

/**
 * Request to save quotas for a rep across multiple months.
 */
export interface BulkMultiMonthQuotaInput {
  repId: string;
  quotas: Array<{
    year: number;
    month: number;
    targetCents: number;
    note?: string;
  }>;
}

/**
 * Request to apply growth rate to quotas.
 */
export interface ApplyGrowthRateInput {
  repId: string;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  growthPercent: number;  // e.g., 10 for 10% increase
}
