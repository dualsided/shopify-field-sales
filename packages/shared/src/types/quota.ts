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
