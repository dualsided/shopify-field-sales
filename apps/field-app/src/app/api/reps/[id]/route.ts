import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireRole, hashPassword } from '@/lib/auth';
import type { ApiError, SalesRepWithTerritories, UpdateSalesRepRequest } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id } = await params;

    const rep = await prisma.salesRep.findFirst({
      where: { id, shopId },
      include: {
        repTerritories: {
          include: {
            territory: true,
          },
        },
      },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Rep not found' } },
        { status: 404 }
      );
    }

    const result: SalesRepWithTerritories = {
      id: rep.id,
      shopId: rep.shopId,
      email: rep.email,
      firstName: rep.firstName,
      lastName: rep.lastName,
      phone: rep.phone,
      role: rep.role,
      isActive: rep.isActive,
      createdAt: rep.createdAt,
      updatedAt: rep.updatedAt,
      territories: rep.repTerritories.map((rt) => ({
        id: rt.territory.id,
        shopId: rt.territory.shopId,
        name: rt.territory.name,
        description: rt.territory.description,
        isActive: rt.territory.isActive,
        createdAt: rt.territory.createdAt,
        updatedAt: rt.territory.updatedAt,
      })),
    };

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error fetching rep:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch rep' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN');
    const { id } = await params;
    const body = (await request.json()) as UpdateSalesRepRequest;

    // Verify rep exists
    const existing = await prisma.salesRep.findFirst({
      where: { id, shopId },
    });

    if (!existing) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Rep not found' } },
        { status: 404 }
      );
    }

    // Check for duplicate email if email is being changed
    if (body.email && body.email.toLowerCase() !== existing.email.toLowerCase()) {
      const duplicate = await prisma.salesRep.findFirst({
        where: {
          shopId,
          email: { equals: body.email.toLowerCase(), mode: 'insensitive' },
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'CONFLICT', message: 'A rep with this email already exists' } },
          { status: 409 }
        );
      }
    }

    // Validate password if provided
    if (body.password !== undefined && body.password.length < 8) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.email !== undefined) updateData.email = body.email.toLowerCase().trim();
    if (body.firstName !== undefined) updateData.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updateData.lastName = body.lastName.trim();
    if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.password) updateData.passwordHash = await hashPassword(body.password);

    const rep = await prisma.salesRep.update({
      where: { id },
      data: updateData,
      include: {
        repTerritories: {
          include: {
            territory: true,
          },
        },
      },
    });

    const result: SalesRepWithTerritories = {
      id: rep.id,
      shopId: rep.shopId,
      email: rep.email,
      firstName: rep.firstName,
      lastName: rep.lastName,
      phone: rep.phone,
      role: rep.role,
      isActive: rep.isActive,
      createdAt: rep.createdAt,
      updatedAt: rep.updatedAt,
      territories: rep.repTerritories.map((rt) => ({
        id: rt.territory.id,
        shopId: rt.territory.shopId,
        name: rt.territory.name,
        description: rt.territory.description,
        isActive: rt.territory.isActive,
        createdAt: rt.territory.createdAt,
        updatedAt: rt.territory.updatedAt,
      })),
    };

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error updating rep:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update rep' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN');
    const { id } = await params;

    // Verify rep exists
    const rep = await prisma.salesRep.findFirst({
      where: { id, shopId },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Rep not found' } },
        { status: 404 }
      );
    }

    // Soft delete by deactivating
    await prisma.salesRep.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Error deleting rep:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete rep' } },
      { status: 500 }
    );
  }
}
