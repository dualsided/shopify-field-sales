import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { createAccessToken, createRefreshToken, getAccessTokenExpiry } from '@/lib/auth';

interface DevLoginRequest {
  repId: string;
}

/**
 * DEV ONLY: Login as any sales rep without authentication
 * This endpoint should be disabled in production
 */
export async function POST(request: Request) {
  // In production, this endpoint should be disabled
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_AUTH) {
    return NextResponse.json(
      { data: null, error: { code: 'FORBIDDEN', message: 'Dev auth disabled in production' } },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as DevLoginRequest;
    const { repId } = body;

    if (!repId) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Rep ID is required' } },
        { status: 400 }
      );
    }

    // Find the rep
    const rep = await prisma.salesRep.findFirst({
      where: {
        id: repId,
        isActive: true,
        shop: { isActive: true },
      },
      include: {
        shop: true,
      },
    });

    if (!rep) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Sales rep not found' } },
        { status: 404 }
      );
    }

    // Create tokens (bypassing password verification)
    const accessToken = await createAccessToken({
      shopId: rep.shopId,
      repId: rep.id,
      role: rep.role,
      email: rep.email,
    });

    const refreshToken = await createRefreshToken({
      shopId: rep.shopId,
      repId: rep.id,
    });

    const expiresIn = getAccessTokenExpiry();

    // Set auth cookies
    const cookieStore = await cookies();
    cookieStore.set('auth_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expiresIn,
      path: '/',
    });

    cookieStore.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return NextResponse.json({
      data: {
        accessToken,
        refreshToken,
        expiresIn,
        rep: {
          id: rep.id,
          email: rep.email,
          firstName: rep.firstName,
          lastName: rep.lastName,
          role: rep.role,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error('Dev login error:', error);
    return NextResponse.json(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } },
      { status: 500 }
    );
  }
}
