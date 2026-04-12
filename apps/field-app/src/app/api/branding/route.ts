import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const { shopId } = await getAuthContext();

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        logoUrl: true,
        accentColor: true,
        shopName: true,
      },
    });

    if (!shop) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Shop not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        logoUrl: shop.logoUrl,
        accentColor: shop.accentColor || '#4F46E5', // Default indigo
        shopName: shop.shopName,
      },
      error: null,
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    return NextResponse.json(
      { data: null, error: { code: 'SERVER_ERROR', message: 'Failed to fetch branding' } },
      { status: 500 }
    );
  }
}
