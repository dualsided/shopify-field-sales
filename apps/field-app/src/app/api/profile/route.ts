import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext, hashPassword } from '@/lib/auth';
import type { ApiError } from '@/types';

interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export async function GET() {
  try {
    const { shopId, repId } = await getAuthContext();

    const rep = await prisma.salesRep.findFirst({
      where: { id: repId, shopId },
      include: {
        shop: { select: { shopName: true, shopifyDomain: true } },
        repTerritories: {
          include: { territory: { select: { name: true } } },
          where: { territory: { isActive: true } },
        },
        _count: {
          select: { assignedCompanies: true, orders: true },
        },
      },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' } },
        { status: 404 }
      );
    }

    const response = {
      id: rep.id,
      email: rep.email,
      firstName: rep.firstName,
      lastName: rep.lastName,
      phone: rep.phone,
      role: rep.role,
      isActive: rep.isActive,
      createdAt: rep.createdAt.toISOString(),
      shop: {
        name: rep.shop.shopName,
        domain: rep.shop.shopifyDomain,
      },
      territories: rep.repTerritories.map((rt) => rt.territory.name),
      stats: {
        assignedCompanies: rep._count.assignedCompanies,
        totalOrders: rep._count.orders,
      },
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch profile' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { shopId, repId } = await getAuthContext();
    const body = (await request.json()) as UpdateProfileRequest;

    const rep = await prisma.salesRep.findFirst({
      where: { id: repId, shopId },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Profile not found' } },
        { status: 404 }
      );
    }

    // If changing password, verify current password
    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Current password is required' } },
          { status: 400 }
        );
      }

      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(body.currentPassword, rep.passwordHash);

      if (!isValid) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Current password is incorrect' } },
          { status: 400 }
        );
      }

      if (body.newPassword.length < 8) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' } },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.firstName !== undefined) updateData.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updateData.lastName = body.lastName.trim();
    if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
    if (body.newPassword) updateData.passwordHash = await hashPassword(body.newPassword);

    const updated = await prisma.salesRep.update({
      where: { id: repId },
      data: updateData,
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
        role: updated.role,
      },
      error: null,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' } },
      { status: 500 }
    );
  }
}
