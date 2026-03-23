import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth';
import type { ApiError, CompanyLocation } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CreateLocationRequest {
  name: string;
  isPrimary?: boolean;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;
  zipcode?: string;
  country?: string;
  countryCode?: string;
  phone?: string;
  isShippingAddress?: boolean;
  isBillingAddress?: boolean;
}

// GET: List locations for a company
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id: companyId } = await params;

    // Verify company exists and belongs to shop
    const company = await prisma.company.findFirst({
      where: { id: companyId, shopId },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Only allow location management for internal companies
    if (company.shopifyCompanyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: 'Locations for Shopify-managed companies are managed in Shopify Admin' } },
        { status: 403 }
      );
    }

    const locations = await prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });

    const result: CompanyLocation[] = locations.map((loc) => ({
      id: loc.id,
      companyId: loc.companyId,
      shopifyLocationId: loc.shopifyLocationId,
      name: loc.name,
      isPrimary: loc.isPrimary,
      address1: loc.address1,
      address2: loc.address2,
      city: loc.city,
      province: loc.province,
      provinceCode: loc.provinceCode,
      zipcode: loc.zipcode,
      country: loc.country,
      countryCode: loc.countryCode,
      phone: loc.phone,
      isShippingAddress: loc.isShippingAddress,
      isBillingAddress: loc.isBillingAddress,
      createdAt: loc.createdAt,
      updatedAt: loc.updatedAt,
    }));

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch locations' } },
      { status: 500 }
    );
  }
}

// POST: Create a new location for an internal company
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id: companyId } = await params;
    const body = (await request.json()) as CreateLocationRequest;

    // Verify company exists and belongs to shop
    const company = await prisma.company.findFirst({
      where: { id: companyId, shopId },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Only allow location management for internal companies
    if (company.shopifyCompanyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: 'Locations for Shopify-managed companies are managed in Shopify Admin' } },
        { status: 403 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Location name is required' } },
        { status: 400 }
      );
    }

    // If setting as primary, unset other primaries
    if (body.isPrimary) {
      await prisma.companyLocation.updateMany({
        where: { companyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Check if this is the first location (auto set as primary)
    const existingCount = await prisma.companyLocation.count({ where: { companyId } });
    const isPrimary = body.isPrimary || existingCount === 0;

    const location = await prisma.companyLocation.create({
      data: {
        companyId,
        name: body.name.trim(),
        isPrimary,
        address1: body.address1?.trim() || null,
        address2: body.address2?.trim() || null,
        city: body.city?.trim() || null,
        province: body.province?.trim() || null,
        provinceCode: body.provinceCode?.trim() || null,
        zipcode: body.zipcode?.trim() || null,
        country: body.country?.trim() || 'US',
        countryCode: body.countryCode?.trim() || 'US',
        phone: body.phone?.trim() || null,
        isShippingAddress: body.isShippingAddress ?? true,
        isBillingAddress: body.isBillingAddress ?? true,
      },
    });

    const result: CompanyLocation = {
      id: location.id,
      companyId: location.companyId,
      shopifyLocationId: location.shopifyLocationId,
      name: location.name,
      isPrimary: location.isPrimary,
      address1: location.address1,
      address2: location.address2,
      city: location.city,
      province: location.province,
      provinceCode: location.provinceCode,
      zipcode: location.zipcode,
      country: location.country,
      countryCode: location.countryCode,
      phone: location.phone,
      isShippingAddress: location.isShippingAddress,
      isBillingAddress: location.isBillingAddress,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating location:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to create location' } },
      { status: 500 }
    );
  }
}
