import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import {
  stripe,
  getOrCreateStripeCustomer,
  createSetupIntent,
  getPaymentMethod,
  detachPaymentMethod,
} from '@/lib/stripe/client';
import type { ApiError } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: List payment methods for a company
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;
    const { shopId, repId, role } = await getAuthContext();

    // Get company and verify access
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        shopId,
        ...(role === 'REP'
          ? {
              OR: [
                { assignedRepId: repId },
                { territory: { repTerritories: { some: { repId } } } },
              ],
            }
          : {}),
      },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Get payment methods from database
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: {
        shopId,
        companyId,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    const response = paymentMethods.map((pm) => ({
      id: pm.id,
      provider: pm.provider,
      last4: pm.last4,
      brand: pm.brand,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt.toISOString(),
    }));

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payment methods' } },
      { status: 500 }
    );
  }
}

// POST: Create setup intent for adding a new payment method
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;
    const { shopId, repId, role } = await getAuthContext();

    if (!stripe) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'CONFIG_ERROR', message: 'Payment processing not configured' } },
        { status: 503 }
      );
    }

    // Get company and verify access
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        shopId,
        ...(role === 'REP'
          ? {
              OR: [
                { assignedRepId: repId },
                { territory: { repTerritories: { some: { repId } } } },
              ],
            }
          : {}),
      },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(company.name, undefined, {
      shopId,
      companyId: company.id,
    });

    if (!customerId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'STRIPE_ERROR', message: 'Failed to create customer' } },
        { status: 500 }
      );
    }

    // Create setup intent
    const setupIntent = await createSetupIntent(customerId);

    if (!setupIntent) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'STRIPE_ERROR', message: 'Failed to create setup intent' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        clientSecret: setupIntent.clientSecret,
        customerId,
      },
      error: null,
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to setup payment method' } },
      { status: 500 }
    );
  }
}

// PUT: Confirm payment method setup and save to database
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;
    const { shopId, repId, role } = await getAuthContext();
    const body = await request.json();

    const { paymentMethodId, customerId, setAsDefault } = body as {
      paymentMethodId: string;
      customerId: string;
      setAsDefault?: boolean;
    };

    if (!paymentMethodId || !customerId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } },
        { status: 400 }
      );
    }

    // Get company and verify access
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        shopId,
        ...(role === 'REP'
          ? {
              OR: [
                { assignedRepId: repId },
                { territory: { repTerritories: { some: { repId } } } },
              ],
            }
          : {}),
      },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Get payment method details from Stripe
    const paymentMethod = await getPaymentMethod(paymentMethodId);

    if (!paymentMethod || paymentMethod.type !== 'card' || !paymentMethod.card) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'STRIPE_ERROR', message: 'Invalid payment method' } },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults
    if (setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: {
          shopId,
          companyId,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Check if this is the first payment method (auto set as default)
    const existingCount = await prisma.paymentMethod.count({
      where: {
        shopId,
        companyId,
      },
    });

    const isDefault = setAsDefault || existingCount === 0;

    // Save payment method to database
    const savedMethod = await prisma.paymentMethod.create({
      data: {
        shopId,
        companyId,
        provider: 'STRIPE',
        externalCustomerId: customerId,
        externalMethodId: paymentMethodId,
        last4: paymentMethod.card.last4,
        brand: paymentMethod.card.brand,
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
        isDefault,
      },
    });

    return NextResponse.json({
      data: {
        id: savedMethod.id,
        provider: savedMethod.provider,
        last4: savedMethod.last4,
        brand: savedMethod.brand,
        expiryMonth: savedMethod.expiryMonth,
        expiryYear: savedMethod.expiryYear,
        isDefault: savedMethod.isDefault,
      },
      error: null,
    });
  } catch (error) {
    console.error('Error saving payment method:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to save payment method' } },
      { status: 500 }
    );
  }
}

// DELETE: Remove a payment method
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: companyId } = await params;
    const { shopId, repId, role } = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const paymentMethodId = searchParams.get('paymentMethodId');

    if (!paymentMethodId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Payment method ID required' } },
        { status: 400 }
      );
    }

    // Get company and verify access
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        shopId,
        ...(role === 'REP'
          ? {
              OR: [
                { assignedRepId: repId },
                { territory: { repTerritories: { some: { repId } } } },
              ],
            }
          : {}),
      },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Find payment method
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        shopId,
        companyId,
      },
    });

    if (!paymentMethod) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Payment method not found' } },
        { status: 404 }
      );
    }

    // Detach from Stripe
    if (paymentMethod.provider === 'STRIPE') {
      await detachPaymentMethod(paymentMethod.externalMethodId);
    }

    // Delete from database
    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    // If this was the default, set another as default
    if (paymentMethod.isDefault) {
      const nextMethod = await prisma.paymentMethod.findFirst({
        where: {
          shopId,
          companyId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (nextMethod) {
        await prisma.paymentMethod.update({
          where: { id: nextMethod.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete payment method' } },
      { status: 500 }
    );
  }
}
