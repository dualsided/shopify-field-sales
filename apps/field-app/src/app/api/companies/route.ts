import { NextResponse } from 'next/server';
import { Prisma } from '@field-sales/database';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext, requireRole } from '@/lib/auth';
import type { ApiError, Company, CompanyListItem, CreateCompanyRequest, PaginatedResponse, PaymentTerms } from '@/types';

export async function GET(request: Request) {
  try {
    const { shopId, repId, role } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const query = searchParams.get('query') || '';
    const territoryId = searchParams.get('territoryId') || null;
    const assignedRepId = searchParams.get('assignedRepId') || null;
    const myCompaniesOnly = searchParams.get('myCompaniesOnly') === 'true';

    const skip = (page - 1) * pageSize;

    // Build where clause based on filters and role
    const where: Prisma.CompanyWhereInput = {
      shopId,
      isActive: true,
    };

    // For reps, filter to their territories or assigned companies
    if (role === 'REP' || myCompaniesOnly) {
      // Get territories assigned to this rep
      const repTerritories = await prisma.repTerritory.findMany({
        where: { repId },
        select: { territoryId: true },
      });
      const repTerritoryIds = repTerritories.map((rt) => rt.territoryId);

      where.OR = [
        { territoryId: { in: repTerritoryIds } },
        { assignedRepId: repId },
      ];
    }

    // Apply additional filters
    if (territoryId) {
      where.territoryId = territoryId;
    }

    if (assignedRepId) {
      where.assignedRepId = assignedRepId;
    }

    if (query) {
      where.AND = [
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { accountNumber: { contains: query, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [companies, totalItems] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          territory: { select: { name: true } },
          assignedRep: { select: { firstName: true, lastName: true } },
          _count: {
            select: {
              locations: true,
              contacts: true,
            },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    const items: CompanyListItem[] = companies.map((c) => ({
      id: c.id,
      shopifyCompanyId: c.shopifyCompanyId,
      name: c.name,
      accountNumber: c.accountNumber,
      locationCount: c._count.locations,
      contactCount: c._count.contacts,
      territoryName: c.territory?.name || null,
      assignedRepName: c.assignedRep
        ? `${c.assignedRep.firstName} ${c.assignedRep.lastName}`
        : null,
      isShopifyManaged: c.shopifyCompanyId !== null,
    }));

    const totalPages = Math.ceil(totalItems / pageSize);

    const response: PaginatedResponse<CompanyListItem> = {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch companies' } },
      { status: 500 }
    );
  }
}

// POST: Create an internal company (only for shops without managed companies)
export async function POST(request: Request) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const body = (await request.json()) as CreateCompanyRequest;

    // Check if shop has managed companies enabled
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { hasManagedCompanies: true },
    });

    if (shop?.hasManagedCompanies) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: 'Companies are managed in Shopify Admin for this store' } },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Company name is required' } },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existingName = await prisma.company.findFirst({
      where: {
        shopId,
        name: { equals: body.name.trim(), mode: 'insensitive' },
      },
    });

    if (existingName) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'CONFLICT', message: 'A company with this name already exists' } },
        { status: 409 }
      );
    }

    // Check for duplicate account number if provided
    if (body.accountNumber?.trim()) {
      const existingAccount = await prisma.company.findFirst({
        where: {
          shopId,
          accountNumber: { equals: body.accountNumber.trim(), mode: 'insensitive' },
        },
      });

      if (existingAccount) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'CONFLICT', message: 'A company with this account number already exists' } },
          { status: 409 }
        );
      }
    }

    // Validate territory if provided
    if (body.territoryId) {
      const territory = await prisma.territory.findFirst({
        where: { id: body.territoryId, shopId, isActive: true },
      });

      if (!territory) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid territory ID' } },
          { status: 400 }
        );
      }
    }

    // Validate assigned rep if provided
    if (body.assignedRepId) {
      const rep = await prisma.salesRep.findFirst({
        where: { id: body.assignedRepId, shopId, isActive: true },
      });

      if (!rep) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid rep ID' } },
          { status: 400 }
        );
      }
    }

    // Validate payment terms
    const validPaymentTerms: PaymentTerms[] = ['DUE_ON_ORDER', 'NET_15', 'NET_30', 'NET_45', 'NET_60'];
    const paymentTerms = body.paymentTerms || 'DUE_ON_ORDER';
    if (!validPaymentTerms.includes(paymentTerms)) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid payment terms' } },
        { status: 400 }
      );
    }

    // Create company with optional locations and contacts
    const company = await prisma.company.create({
      data: {
        shopId,
        shopifyCompanyId: null, // Internal company
        name: body.name.trim(),
        accountNumber: body.accountNumber?.trim() || null,
        paymentTerms,
        territoryId: body.territoryId || null,
        assignedRepId: body.assignedRepId || null,
        syncStatus: 'SYNCED',
        isActive: true,
        ...(body.locations?.length && {
          locations: {
            create: body.locations.map((loc, index) => ({
              name: loc.name.trim(),
              isPrimary: loc.isPrimary ?? index === 0,
              address1: loc.address1?.trim() || null,
              address2: loc.address2?.trim() || null,
              city: loc.city?.trim() || null,
              province: loc.province?.trim() || null,
              provinceCode: loc.provinceCode?.trim() || null,
              zipcode: loc.zipcode?.trim() || null,
              country: loc.country?.trim() || 'US',
              countryCode: loc.countryCode?.trim() || 'US',
              phone: loc.phone?.trim() || null,
              isShippingAddress: loc.isShippingAddress ?? true,
              isBillingAddress: loc.isBillingAddress ?? true,
            })),
          },
        }),
        ...(body.contacts?.length && {
          contacts: {
            create: body.contacts.map((contact, index) => ({
              firstName: contact.firstName.trim(),
              lastName: contact.lastName.trim(),
              email: contact.email.trim().toLowerCase(),
              phone: contact.phone?.trim() || null,
              title: contact.title?.trim() || null,
              isPrimary: contact.isPrimary ?? index === 0,
              canPlaceOrders: contact.canPlaceOrders ?? true,
            })),
          },
        }),
      },
    });

    const result: Company = {
      id: company.id,
      shopId: company.shopId,
      shopifyCompanyId: company.shopifyCompanyId,
      name: company.name,
      accountNumber: company.accountNumber,
      paymentTerms: company.paymentTerms,
      territoryId: company.territoryId,
      assignedRepId: company.assignedRepId,
      syncStatus: company.syncStatus,
      lastSyncedAt: company.lastSyncedAt,
      isActive: company.isActive,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to create company' } },
      { status: 500 }
    );
  }
}
