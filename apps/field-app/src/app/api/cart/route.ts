import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthContext } from '@/lib/auth';
import type { ApiError, CartSession, CartLineItem, CartSummary } from '@/types';

interface CartResponse {
  cart: CartSession;
  summary: CartSummary;
}

interface UpdateCartRequest {
  companyId: string;
  action: 'add' | 'remove' | 'update' | 'clear';
  item?: {
    variantId: string;
    productId: string;
    title: string;
    variantTitle?: string;
    sku?: string;
    quantity: number;
    price: string;
    imageUrl?: string;
  };
  notes?: string;
  discountCodes?: string[];
}

function calculateSummary(lineItems: CartLineItem[]): CartSummary {
  let subtotal = 0;
  let itemCount = 0;

  for (const item of lineItems) {
    subtotal += parseFloat(item.price) * item.quantity;
    itemCount += item.quantity;
  }

  return {
    itemCount,
    subtotal: subtotal.toFixed(2),
    currency: 'USD',
  };
}

export async function GET(request: Request) {
  try {
    const { shopId, repId } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Company ID is required' } },
        { status: 400 }
      );
    }

    // Find or create active cart for this company
    let cart = await prisma.cartSession.findFirst({
      where: {
        shopId,
        repId,
        companyId,
        status: 'ACTIVE',
      },
    });

    if (!cart) {
      // Create new cart
      cart = await prisma.cartSession.create({
        data: {
          shopId,
          repId,
          companyId,
          lineItems: [],
          discountCodes: [],
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
    }

    const lineItems = (cart.lineItems ?? []) as unknown as CartLineItem[];
    const response: CartResponse = {
      cart: {
        id: cart.id,
        shopId: cart.shopId,
        repId: cart.repId,
        companyId: cart.companyId,
        lineItems,
        discountCodes: cart.discountCodes,
        notes: cart.notes,
        status: cart.status,
        expiresAt: cart.expiresAt,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
      summary: calculateSummary(lineItems),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch cart' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { shopId, repId } = await getAuthContext();
    const body = (await request.json()) as UpdateCartRequest;

    if (!body.companyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Company ID is required' } },
        { status: 400 }
      );
    }

    // Find or create active cart
    let cart = await prisma.cartSession.findFirst({
      where: {
        shopId,
        repId,
        companyId: body.companyId,
        status: 'ACTIVE',
      },
    });

    if (!cart) {
      cart = await prisma.cartSession.create({
        data: {
          shopId,
          repId,
          companyId: body.companyId,
          lineItems: [],
          discountCodes: [],
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    let lineItems = (cart.lineItems ?? []) as unknown as CartLineItem[];

    switch (body.action) {
      case 'add': {
        if (!body.item) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Item is required for add action' } },
            { status: 400 }
          );
        }

        const existingIndex = lineItems.findIndex((i) => i.variantId === body.item!.variantId);

        if (existingIndex >= 0) {
          lineItems[existingIndex].quantity += body.item.quantity;
        } else {
          lineItems.push({
            variantId: body.item.variantId,
            productId: body.item.productId,
            title: body.item.title,
            variantTitle: body.item.variantTitle || null,
            sku: body.item.sku || null,
            quantity: body.item.quantity,
            price: body.item.price,
            imageUrl: body.item.imageUrl || null,
          });
        }
        break;
      }

      case 'remove': {
        if (!body.item?.variantId) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Variant ID is required for remove action' } },
            { status: 400 }
          );
        }

        lineItems = lineItems.filter((i) => i.variantId !== body.item!.variantId);
        break;
      }

      case 'update': {
        if (!body.item) {
          return NextResponse.json<ApiError>(
            { data: null, error: { code: 'VALIDATION_ERROR', message: 'Item is required for update action' } },
            { status: 400 }
          );
        }

        const index = lineItems.findIndex((i) => i.variantId === body.item!.variantId);

        if (index >= 0) {
          if (body.item.quantity <= 0) {
            lineItems.splice(index, 1);
          } else {
            lineItems[index].quantity = body.item.quantity;
          }
        }
        break;
      }

      case 'clear': {
        lineItems = [];
        break;
      }
    }

    // Update cart
    const updatedCart = await prisma.cartSession.update({
      where: { id: cart.id },
      data: {
        lineItems: lineItems as unknown as Parameters<typeof prisma.cartSession.update>[0]['data']['lineItems'],
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.discountCodes && { discountCodes: body.discountCodes }),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Extend expiry
      },
    });

    const response: CartResponse = {
      cart: {
        id: updatedCart.id,
        shopId: updatedCart.shopId,
        repId: updatedCart.repId,
        companyId: updatedCart.companyId,
        lineItems,
        discountCodes: updatedCart.discountCodes,
        notes: updatedCart.notes,
        status: updatedCart.status,
        expiresAt: updatedCart.expiresAt,
        createdAt: updatedCart.createdAt,
        updatedAt: updatedCart.updatedAt,
      },
      summary: calculateSummary(lineItems),
    };

    return NextResponse.json({ data: response, error: null });
  } catch (error) {
    console.error('Error updating cart:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to update cart' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { shopId, repId } = await getAuthContext();
    const { searchParams } = new URL(request.url);

    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json<ApiError>(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Company ID is required' } },
        { status: 400 }
      );
    }

    await prisma.cartSession.updateMany({
      where: {
        shopId,
        repId,
        companyId,
        status: 'ACTIVE',
      },
      data: {
        status: 'ABANDONED',
      },
    });

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Error deleting cart:', error);
    return NextResponse.json<ApiError>(
      { data: null, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete cart' } },
      { status: 500 }
    );
  }
}
