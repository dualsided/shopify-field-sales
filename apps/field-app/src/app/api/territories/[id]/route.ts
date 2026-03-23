import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext, requireRole } from '@/lib/auth';
import type { ApiError, TerritoryWithZipcodes, UpdateTerritoryRequest } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await getAuthContext();
    const { id } = await params;

    const territory = await prisma.territory.findFirst({
      where: { id, shopId },
      include: { zipcodes: true },
    });

    if (!territory) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Territory not found' } },
        { status: 404 }
      );
    }

    const result: TerritoryWithZipcodes = {
      id: territory.id,
      shopId: territory.shopId,
      name: territory.name,
      description: territory.description,
      isActive: territory.isActive,
      createdAt: territory.createdAt,
      updatedAt: territory.updatedAt,
      zipcodes: territory.zipcodes.map((z) => z.zipcode),
    };

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error fetching territory:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch territory' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id } = await params;
    const body = (await request.json()) as UpdateTerritoryRequest;

    // Verify territory exists and belongs to tenant
    const existing = await prisma.territory.findFirst({
      where: { id, shopId },
    });

    if (!existing) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Territory not found' } },
        { status: 404 }
      );
    }

    // Check for duplicate name if name is being changed
    if (body.name && body.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.territory.findFirst({
        where: {
          shopId,
          name: { equals: body.name.trim(), mode: 'insensitive' },
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json<ApiError>(
          { data: null, error: { code: 'CONFLICT', message: 'A territory with this name already exists' } },
          { status: 409 }
        );
      }
    }

    // Update territory and zipcodes in a transaction
    const territory = await prisma.$transaction(async (tx) => {
      // If zipcodes are provided, delete existing and create new ones
      if (body.zipcodes !== undefined) {
        await tx.territoryZipcode.deleteMany({ where: { territoryId: id } });

        if (body.zipcodes.length > 0) {
          await tx.territoryZipcode.createMany({
            data: body.zipcodes.map((zipcode) => ({
              territoryId: id,
              zipcode: zipcode.trim(),
            })),
          });
        }
      }

      return tx.territory.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.description !== undefined && { description: body.description?.trim() || null }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
        include: { zipcodes: true },
      });
    });

    const result: TerritoryWithZipcodes = {
      id: territory.id,
      shopId: territory.shopId,
      name: territory.name,
      description: territory.description,
      isActive: territory.isActive,
      createdAt: territory.createdAt,
      updatedAt: territory.updatedAt,
      zipcodes: territory.zipcodes.map((z) => z.zipcode),
    };

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error updating territory:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update territory' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN');
    const { id } = await params;

    // Verify territory exists and belongs to tenant
    const territory = await prisma.territory.findFirst({
      where: { id, shopId },
      include: {
        _count: {
          select: { companies: true, repTerritories: true },
        },
      },
    });

    if (!territory) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Territory not found' } },
        { status: 404 }
      );
    }

    // Prevent deletion if territory has companies or reps assigned
    if (territory._count.companies > 0) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: {
            code: 'CONFLICT',
            message: `Cannot delete territory with ${territory._count.companies} assigned companies. Remove companies first.`,
          },
        },
        { status: 409 }
      );
    }

    if (territory._count.repTerritories > 0) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: {
            code: 'CONFLICT',
            message: `Cannot delete territory with ${territory._count.repTerritories} assigned reps. Remove reps first.`,
          },
        },
        { status: 409 }
      );
    }

    // Delete territory and its zipcodes (cascade)
    await prisma.territory.delete({ where: { id } });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Error deleting territory:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete territory' } },
      { status: 500 }
    );
  }
}
