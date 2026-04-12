import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendVerificationCode } from '@/lib/twilio';
import type { ApiError } from '@/types';

interface SendOtpRequest {
  phone: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendOtpRequest;
    const { phone } = body;

    if (!phone) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Phone number is required' },
        },
        { status: 400 }
      );
    }

    // Normalize phone for lookup (remove non-digits, handle formats)
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
      // Don't reveal if phone exists or not for security
      // Still return success to prevent phone enumeration
      return NextResponse.json({
        data: { sent: true },
        error: null,
      });
    }

    // Send OTP via Twilio
    const result = await sendVerificationCode(phone);

    if (!result.success) {
      return NextResponse.json<ApiError>(
        {
          data: null,
          error: { code: 'SMS_ERROR', message: result.error || 'Failed to send verification code' },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { sent: true },
      error: null,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json<ApiError>(
      {
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'An error occurred sending verification code' },
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
