import { NextResponse } from 'next/server';
import { Prisma } from '.prisma/field-app-client';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth';
import { hashPassword } from '@/lib/auth';
import type {
  ApiError,
  SalesRepListItem,
  CreateSalesRepRequest,
  PaginatedResponse,
} from '@/types';

export async function GET(request: Request) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const query = searchParams.get('query') || '';
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const skip = (page - 1) * pageSize;

    const where: Prisma.SalesRepWhereInput = {
      shopId,
      ...(activeOnly && { isActive: true }),
      ...(query && {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      }),
    };

    const [reps, totalItems] = await Promise.all([
      prisma.salesRep.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          _count: {
            select: {
              repTerritories: true,
              assignedCompanies: true,
            },
          },
        },
      }),
      prisma.salesRep.count({ where }),
    ]);

    const items: SalesRepListItem[] = reps.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      role: r.role,
      isActive: r.isActive,
      territoryCount: r._count.repTerritories,
      companyCount: r._count.assignedCompanies,
    }));

    const totalPages = Math.ceil(totalItems / pageSize);

    const response: PaginatedResponse<SalesRepListItem> = {
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
    console.error('Error fetching reps:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch reps' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { shopId } = await requireRole('ADMIN');
    const body = (await request.json()) as CreateSalesRepRequest;

    // Validate required fields
    if (!body.email?.trim() || !body.firstName?.trim() || !body.lastName?.trim()) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Email, first name, and last name are required' } },
        { status: 400 }
      );
    }

    if (!body.password || body.password.length < 8) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } },
        { status: 400 }
      );
    }

    // Check for duplicate email
    const existing = await prisma.salesRep.findFirst({
      where: {
        shopId,
        email: { equals: body.email.toLowerCase(), mode: 'insensitive' },
      },
    });

    if (existing) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'CONFLICT', message: 'A rep with this email already exists' } },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(body.password);

    const rep = await prisma.salesRep.create({
      data: {
        shopId,
        email: body.email.toLowerCase().trim(),
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone?.trim() || null,
        role: body.role || 'REP',
        passwordHash,
        isActive: true,
      },
    });

    const result: SalesRepListItem = {
      id: rep.id,
      email: rep.email,
      firstName: rep.firstName,
      lastName: rep.lastName,
      role: rep.role,
      isActive: rep.isActive,
      territoryCount: 0,
      companyCount: 0,
    };

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating rep:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to create rep' } },
      { status: 500 }
    );
  }
}
