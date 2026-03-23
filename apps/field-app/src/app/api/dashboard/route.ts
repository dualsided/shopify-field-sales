import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

export async function GET() {
  try {
    const { shopId, repId, role } = await getAuthContext();

    // Date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Base filter for role-based access
    const repFilter = role === 'REP' ? { salesRepId: repId } : {};

    // Get this month's orders
    const [
      ordersThisMonth,
      ordersLastMonth,
      totalRevenue,
      lastMonthRevenue,
      accountCount,
      pendingOrders,
      recentOrders,
    ] = await Promise.all([
      // Orders this month
      prisma.order.count({
        where: {
          shopId,
          ...repFilter,
          placedAt: { gte: startOfMonth },
        },
      }),

      // Orders last month
      prisma.order.count({
        where: {
          shopId,
          ...repFilter,
          placedAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),

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

      // Account count
      role === 'REP'
        ? prisma.company.count({
            where: {
              shopId,
              syncStatus: 'SYNCED',
              OR: [
                { assignedRepId: repId },
                {
                  territory: {
                    repTerritories: { some: { repId } },
                  },
                },
              ],
            },
          })
        : prisma.company.count({
            where: { shopId, syncStatus: 'SYNCED' },
          }),

      // Pending orders
      prisma.order.count({
        where: {
          shopId,
          ...repFilter,
          status: 'PENDING',
        },
      }),

      // Recent orders (last 5)
      prisma.order.findMany({
        where: {
          shopId,
          ...repFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          company: { select: { name: true } },
        },
      }),
    ]);

    // Convert cents to dollars
    const thisMonthRevenue = (totalRevenue._sum?.totalCents || 0) / 100;
    const prevMonthRevenue = (lastMonthRevenue._sum?.totalCents || 0) / 100;

    // Calculate percentage changes
    const orderChange = ordersLastMonth > 0
      ? Math.round(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100)
      : ordersThisMonth > 0 ? 100 : 0;

    const revenueChange = prevMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    const response = {
      metrics: {
        ordersThisMonth,
        orderChange,
        revenue: thisMonthRevenue,
        revenueChange,
        accountCount,
        pendingOrders,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        shopifyOrderNumber: o.shopifyOrderNumber,
        totalCents: o.totalCents,
        currency: o.currency,
        status: o.status,
        placedAt: o.placedAt?.toISOString() || null,
        createdAt: o.createdAt.toISOString(),
        companyName: o.company.name,
      })),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard' } },
      { status: 500 }
    );
  }
}
