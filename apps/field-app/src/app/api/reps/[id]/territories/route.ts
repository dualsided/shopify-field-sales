import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth';
import type { ApiError, Territory } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AssignTerritoryRequest {
  territoryId: string;
  isPrimary?: boolean;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
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

    const repTerritories = await prisma.repTerritory.findMany({
      where: { repId: id },
      include: { territory: true },
      orderBy: [{ isPrimary: 'desc' }, { territory: { name: 'asc' } }],
    });

    const territories: (Territory & { isPrimary: boolean })[] = repTerritories.map((rt) => ({
      id: rt.territory.id,
      shopId: rt.territory.shopId,
      name: rt.territory.name,
      description: rt.territory.description,
      isActive: rt.territory.isActive,
      createdAt: rt.territory.createdAt,
      updatedAt: rt.territory.updatedAt,
      isPrimary: rt.isPrimary,
    }));

    return NextResponse.json({ data: territories, error: null });
  } catch (error) {
    console.error('Error fetching rep territories:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch territories' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id } = await params;
    const body = (await request.json()) as AssignTerritoryRequest;

    if (!body.territoryId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Territory ID is required' } },
        { status: 400 }
      );
    }

    // Verify rep exists and belongs to tenant
    const rep = await prisma.salesRep.findFirst({
      where: { id, shopId },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Rep not found' } },
        { status: 404 }
      );
    }

    // Verify territory exists and belongs to tenant
    const territory = await prisma.territory.findFirst({
      where: { id: body.territoryId, shopId, isActive: true },
    });

    if (!territory) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Territory not found' } },
        { status: 404 }
      );
    }

    // Check if already assigned
    const existing = await prisma.repTerritory.findFirst({
      where: { repId: id, territoryId: body.territoryId },
    });

    if (existing) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'CONFLICT', message: 'Territory already assigned to this rep' } },
        { status: 409 }
      );
    }

    // If setting as primary, unset other primaries
    if (body.isPrimary) {
      await prisma.repTerritory.updateMany({
        where: { repId: id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await prisma.repTerritory.create({
      data: {
        repId: id,
        territoryId: body.territoryId,
        isPrimary: body.isPrimary || false,
      },
    });

    return NextResponse.json({ data: { success: true }, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error assigning territory:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to assign territory' } },
      { status: 500 }
    );
  }
}
