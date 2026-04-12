import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

export async function GET() {
  try {
    const { shopId, repId, role } = await getAuthContext();

    // Get current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Base filter for role-based access
    const repFilter = role === 'REP' ? { salesRepId: repId } : {};

    // Get companies with their revenue this month
    const companiesWithRevenue = await prisma.order.groupBy({
      by: ['companyId'],
      where: {
        shopId,
        ...repFilter,
        placedAt: { gte: startOfMonth },
        status: { in: ['PENDING', 'PAID'] },
      },
      _sum: {
        totalCents: true,
      },
      orderBy: {
        _sum: {
          totalCents: 'desc',
        },
      },
      take: 10,
    });

    // Get company details for the top companies
    const companyIds = companiesWithRevenue.map((c) => c.companyId);
    const companies = await prisma.company.findMany({
      where: {
        id: { in: companyIds },
        shopId,
      },
      select: {
        id: true,
        name: true,
        accountNumber: true,
      },
    });

    // Create a map for quick lookup
    const companyMap = new Map(companies.map((c) => [c.id, c]));

    // Build response with company details and revenue
    const result = companiesWithRevenue
      .map((item) => {
        const company = companyMap.get(item.companyId);
        if (!company) return null;
        return {
          id: company.id,
          name: company.name,
          accountNumber: company.accountNumber,
          revenueCents: item._sum.totalCents || 0,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error fetching companies by revenue:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch companies' } },
      { status: 500 }
    );
  }
}
