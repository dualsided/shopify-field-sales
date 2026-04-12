import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: List payment methods for a company (from Shopify vault, synced to our database)
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

    // Get payment methods from database (synced from Shopify)
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: {
        shopId,
        companyId,
        isActive: true,
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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
      contactId: pm.contactId,
      contactName: pm.contact ? `${pm.contact.firstName} ${pm.contact.lastName}` : null,
      contactEmail: pm.contact?.email,
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

// DELETE: Remove a payment method (soft delete - mark as inactive)
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

    // Soft delete - mark as inactive (actual removal in Shopify should be done via Shopify admin)
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isActive: false },
    });

    // If this was the default, set another as default
    if (paymentMethod.isDefault) {
      const nextMethod = await prisma.paymentMethod.findFirst({
        where: {
          shopId,
          companyId,
          isActive: true,
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
