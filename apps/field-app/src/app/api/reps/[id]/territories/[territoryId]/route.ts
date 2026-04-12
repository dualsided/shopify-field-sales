import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth';
import type { ApiError } from '@/types';

interface RouteParams {
  params: Promise<{ id: string; territoryId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id, territoryId } = await params;

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

    // Find and delete the assignment (verify territory belongs to same shop)
    const repTerritory = await prisma.repTerritory.findFirst({
      where: {
        repId: id,
        territoryId,
        territory: { shopId },  // Ensure territory belongs to this shop
      },
    });

    if (!repTerritory) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Territory assignment not found' } },
        { status: 404 }
      );
    }

    await prisma.repTerritory.delete({
      where: { id: repTerritory.id },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Error removing territory assignment:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: error.message } },
        { status: 403 }
      );
    }
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to remove territory assignment' } },
      { status: 500 }
    );
  }
}
