import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { verifyCode } from '@/lib/twilio';
import { createAccessToken, createRefreshToken, getAccessTokenExpiry } from '@/lib/auth';
import type { ApiError, LoginResponse } from '@/types';

interface VerifyOtpRequest {
  phone: string;
  code: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyOtpRequest;
    const { phone, code } = body;

    if (!phone || !code) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Phone and verification code are required' },
        },
        { status: 400 }
      );
    }

    // Verify OTP with Twilio
    const verifyResult = await verifyCode(phone, code);

    if (!verifyResult.success) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'INVALID_CODE', message: verifyResult.error || 'Invalid or expired verification code' },
        },
        { status: 401 }
      );
    }

    // Normalize phone for lookup
    const normalizedPhone = normalizePhoneForLookup(phone);

    // Find sales rep by phone number
    const rep = await prisma.salesRep.findFirst({
      where: {
        phone: {
          contains: normalizedPhone,
        },
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
          error: { code: 'NOT_FOUND', message: 'No account found for this phone number' },
        },
        { status: 404 }
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
    console.error('Verify OTP error:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'An error occurred during verification' },
      },
      { status: 500 }
    );
  }
}

/**
 * Normalize phone number for database lookup
 * Extracts last 10 digits for US numbers
 */
function normalizePhoneForLookup(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // If 11 digits starting with 1 (US with country code), take last 10
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  // If 10 digits, return as-is
  if (digits.length === 10) {
    return digits;
  }

  // Return all digits for other formats
  return digits;
}
