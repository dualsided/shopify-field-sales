import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: List locations for a company
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await getAuthContext();
    const { id: companyId } = await params;

    // Verify company exists and belongs to shop
    const company = await prisma.company.findFirst({
      where: { id: companyId, shopId, isActive: true },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    const locations = await prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        address1: true,
        address2: true,
        city: true,
        province: true,
        provinceCode: true,
        zipcode: true,
        country: true,
        countryCode: true,
        phone: true,
        isPrimary: true,
        isShippingAddress: true,
        isBillingAddress: true,
        paymentTermsType: true,
        paymentTermsDays: true,
      },
    });

    return NextResponse.json({ data: locations, error: null });
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch locations' } },
      { status: 500 }
    );
  }
}
