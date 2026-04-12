import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';
import type { QuotaPaceIndicator } from '@field-sales/shared';

function calculateOnPaceIndicator(
  achievedCents: number,
  targetCents: number,
  daysElapsed: number,
  totalDays: number
): QuotaPaceIndicator {
  if (targetCents === 0 || daysElapsed === 0) return 'on_pace';

  const expectedProgress = (daysElapsed / totalDays) * targetCents;
  const ratio = achievedCents / expectedProgress;

  if (ratio >= 1.1) return 'ahead';
  if (ratio >= 0.9) return 'on_pace';
  if (ratio >= 0.7) return 'behind';
  return 'at_risk';
}

export async function GET() {
  try {
    const { shopId, repId, role } = await getAuthContext();

    // Date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Current month for quota
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const totalDays = endOfMonth.getDate();
    const daysElapsed = now.getDate();
    const daysRemaining = Math.max(0, totalDays - daysElapsed);

    // Base filter for role-based access
    const repFilter = role === 'REP' ? { salesRepId: repId } : {};

    const [
      totalRevenue,
      lastMonthRevenue,
      quota,
      paidRevenue,
      pendingRevenue,
    ] = await Promise.all([
      // Total revenue this month
      prisma.order.aggregate({
        where: {
          shopId,
          ...repFilter,
          placedAt: { gte: startOfMonth },
        },
        _sum: { totalCents: true },
      }),

      // Revenue last month
      prisma.order.aggregate({
        where: {
          shopId,
          ...repFilter,
          placedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { totalCents: true },
      }),

      // Quota for current month (only for REP role)
      role === 'REP'
        ? prisma.repQuota.findUnique({
            where: {
              shopId_repId_year_month: { shopId, repId, year, month },
            },
          })
        : Promise.resolve(null),

      // PAID revenue this month (for quota achievement)
      role === 'REP'
        ? prisma.order.aggregate({
            where: {
              shopId,
              salesRepId: repId,
              status: 'PAID',
              placedAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { totalCents: true },
          })
        : Promise.resolve({ _sum: { totalCents: null } }),

      // PENDING revenue this month (for quota projection)
      role === 'REP'
        ? prisma.order.aggregate({
            where: {
              shopId,
              salesRepId: repId,
              status: 'PENDING',
              placedAt: { gte: startOfMonth, lte: endOfMonth },
            },
            _sum: { totalCents: true },
          })
        : Promise.resolve({ _sum: { totalCents: null } }),
    ]);

    // Convert cents to dollars
    const thisMonthRevenue = (totalRevenue._sum?.totalCents || 0) / 100;
    const prevMonthRevenue = (lastMonthRevenue._sum?.totalCents || 0) / 100;

    // Calculate percentage change
    const revenueChange = prevMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    // Build quota progress (only for REP role)
    const achievedCents = paidRevenue._sum?.totalCents || 0;
    const pendingCents = pendingRevenue._sum?.totalCents || 0;
    const projectedCents = achievedCents + pendingCents;

    const quotaProgress = quota
      ? {
          hasQuota: true,
          targetCents: quota.targetCents,
          achievedCents,
          projectedCents,
          progressPercent: Math.round((achievedCents / quota.targetCents) * 100),
          projectedPercent: Math.round((projectedCents / quota.targetCents) * 100),
          remainingCents: Math.max(0, quota.targetCents - achievedCents),
          daysRemaining,
          onPaceIndicator: calculateOnPaceIndicator(
            achievedCents,
            quota.targetCents,
            daysElapsed,
            totalDays
          ),
        }
      : {
          hasQuota: false,
          targetCents: null,
          achievedCents,
          projectedCents,
          progressPercent: 0,
          projectedPercent: 0,
          remainingCents: 0,
          daysRemaining,
          onPaceIndicator: 'no_quota' as QuotaPaceIndicator,
        };

    const response = {
      revenue: thisMonthRevenue,
      revenueChange,
      quota: role === 'REP' ? quotaProgress : null,
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' } },
      { status: 500 }
    );
  }
}
