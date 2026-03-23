import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireRole } from '@/lib/auth';
import type { ApiError, CompanyContact } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CreateContactRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  canPlaceOrders?: boolean;
}

// GET: List contacts for a company
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id: companyId } = await params;

    // Verify company exists and belongs to shop
    const company = await prisma.company.findFirst({
      where: { id: companyId, shopId },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Only allow contact management for internal companies
    if (company.shopifyCompanyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: 'Contacts for Shopify-managed companies are managed in Shopify Admin' } },
        { status: 403 }
      );
    }

    const contacts = await prisma.companyContact.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    const result: CompanyContact[] = contacts.map((contact) => ({
      id: contact.id,
      companyId: contact.companyId,
      shopifyContactId: contact.shopifyContactId,
      shopifyCustomerId: contact.shopifyCustomerId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      isPrimary: contact.isPrimary,
      canPlaceOrders: contact.canPlaceOrders,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    }));

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch contacts' } },
      { status: 500 }
    );
  }
}

// POST: Create a new contact for an internal company
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { shopId } = await requireRole('ADMIN', 'MANAGER');
    const { id: companyId } = await params;
    const body = (await request.json()) as CreateContactRequest;

    // Verify company exists and belongs to shop
    const company = await prisma.company.findFirst({
      where: { id: companyId, shopId },
    });

    if (!company) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 }
      );
    }

    // Only allow contact management for internal companies
    if (company.shopifyCompanyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'FORBIDDEN', message: 'Contacts for Shopify-managed companies are managed in Shopify Admin' } },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.firstName?.trim() || !body.lastName?.trim()) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'First name and last name are required' } },
        { status: 400 }
      );
    }

    if (!body.email?.trim()) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Email is required' } },
        { status: 400 }
      );
    }

    // Check for duplicate email within company
    const existingContact = await prisma.companyContact.findFirst({
      where: {
        companyId,
        email: { equals: body.email.trim().toLowerCase(), mode: 'insensitive' },
      },
    });

    if (existingContact) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'CONFLICT', message: 'A contact with this email already exists for this company' } },
        { status: 409 }
      );
    }

    // If setting as primary, unset other primaries
    if (body.isPrimary) {
      await prisma.companyContact.updateMany({
        where: { companyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Check if this is the first contact (auto set as primary)
    const existingCount = await prisma.companyContact.count({ where: { companyId } });
    const isPrimary = body.isPrimary || existingCount === 0;

    const contact = await prisma.companyContact.create({
      data: {
        companyId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || null,
        title: body.title?.trim() || null,
        isPrimary,
        canPlaceOrders: body.canPlaceOrders ?? true,
      },
    });

    const result: CompanyContact = {
      id: contact.id,
      companyId: contact.companyId,
      shopifyContactId: contact.shopifyContactId,
      shopifyCustomerId: contact.shopifyCustomerId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      isPrimary: contact.isPrimary,
      canPlaceOrders: contact.canPlaceOrders,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to create contact' } },
      { status: 500 }
    );
  }
}
