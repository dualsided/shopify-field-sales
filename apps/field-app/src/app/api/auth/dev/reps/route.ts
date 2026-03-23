import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * DEV ONLY: List all sales reps for the rep selector
 * This endpoint should be disabled in production
 */
export async function GET() {
  // In production, this endpoint should be disabled
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_AUTH) {
    return NextResponse.json(
      { data: null, error: { code: 'FORBIDDEN', message: 'Dev auth disabled in production' } },
      { status: 403 }
    );
  }

  try {
    const reps = await prisma.salesRep.findMany({
      where: { isActive: true },
      include: {
        shop: {
          select: { shopName: true, isActive: true },
        },
      },
      orderBy: [{ shop: { shopName: 'asc' } }, { lastName: 'asc' }],
    });

    const activeReps = reps
      .filter((rep) => rep.shop.isActive)
      .map((rep) => ({
        id: rep.id,
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        role: rep.role,
        shopName: rep.shop.shopName,
      }));

    return NextResponse.json({ data: activeReps, error: null });
  } catch (error) {
    console.error('Error fetching reps:', error);
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch reps' } },
      { status: 500 }
    );
  }
}
