import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword, createAccessToken, createRefreshToken, getAccessTokenExpiry } from '@/lib/auth';
import type { LoginRequest, LoginResponse, ApiError } from '@/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginRequest;
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        },
        { status: 400 }
      );
    }

    // Find rep by email
    // Note: In a real multi-tenant app, you'd also need to resolve the shop
    // This could be done via subdomain, header, or login form field
    const rep = await prisma.salesRep.findFirst({
      where: {
        email: email.toLowerCase(),
        isActive: true,
        shop: { isActive: true },
      },
      include: {
        shop: true,
      },
    });

    if (!rep) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, rep.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        },
        { status: 401 }
      );
    }

    // Create tokens
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

    // Set auth cookie
    const cookieStore = await cookies();
    cookieStore.set('auth_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expiresIn,
      path: '/',
    });

    // Set refresh token cookie
    cookieStore.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    const response: LoginResponse = {
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
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'An error occurred during login' },
      },
      { status: 500 }
    );
  }
}
