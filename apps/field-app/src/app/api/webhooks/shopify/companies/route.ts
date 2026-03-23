import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyWebhook, parseWebhookBody } from '@/lib/shopify/webhook';

interface ShopifyCompanyWebhookPayload {
  id: number;
  name: string;
  note: string | null;
  external_id: string | null;
  main_contact_admin_graphql_api_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ShopifyCompanyLocationWebhookPayload {
  id: number;
  name: string;
  company_id: number;
  shipping_address?: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province_code: string | null;
    zip: string | null;
    country_code: string;
  } | null;
  billing_address?: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    province_code: string | null;
    zip: string | null;
    country_code: string;
  } | null;
}

export async function POST(request: Request) {
  try {
    // Verify webhook signature
    const { valid, shop, topic, rawBody } = await verifyWebhook(request);

    if (!valid) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (!shop || !rawBody) {
      console.error('Missing shop or body');
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    // Find shop by shop domain
    const shopRecord = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopRecord) {
      console.error(`Shop not found for shop: ${shop}`);
      // Return 200 to acknowledge webhook even if shop not found
      // This prevents Shopify from retrying for uninstalled apps
      return NextResponse.json({ received: true, status: 'shop_not_found' });
    }

    // Handle different webhook topics
    switch (topic) {
      case 'companies/create':
      case 'companies/update': {
        const payload = parseWebhookBody<ShopifyCompanyWebhookPayload>(rawBody);
        if (!payload) {
          console.error('Invalid webhook payload');
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        await handleCompanyCreateOrUpdate(shopRecord.id, payload);
        break;
      }

      case 'companies/delete': {
        const payload = parseWebhookBody<{ id: number }>(rawBody);
        if (!payload) {
          console.error('Invalid webhook payload');
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        await handleCompanyDelete(shopRecord.id, payload.id);
        break;
      }

      case 'company_locations/create':
      case 'company_locations/update': {
        const payload = parseWebhookBody<ShopifyCompanyLocationWebhookPayload>(rawBody);
        if (!payload) {
          console.error('Invalid webhook payload');
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        await handleCompanyLocationUpdate(shopRecord.id, payload);
        break;
      }

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Return 200 to prevent retries for unrecoverable errors
    return NextResponse.json({ received: true, error: 'Internal error' });
  }
}

async function handleCompanyCreateOrUpdate(
  shopId: string,
  payload: ShopifyCompanyWebhookPayload
) {
  const shopifyCompanyId = `gid://shopify/Company/${payload.id}`;

  await prisma.company.upsert({
    where: {
      shopId_shopifyCompanyId: {
        shopId,
        shopifyCompanyId,
      },
    },
    update: {
      name: payload.name,
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date(),
    },
    create: {
      shopId,
      shopifyCompanyId,
      name: payload.name,
      syncStatus: 'SYNCED',
      lastSyncedAt: new Date(),
    },
  });

  console.log(`Company synced: ${payload.name} (${shopifyCompanyId})`);
}

async function handleCompanyDelete(shopId: string, companyId: number) {
  const shopifyCompanyId = `gid://shopify/Company/${companyId}`;

  // Soft delete by marking as inactive/error status, or hard delete
  // For now, we'll update the sync status to indicate deletion
  await prisma.company.updateMany({
    where: {
      shopId,
      shopifyCompanyId,
    },
    data: {
      syncStatus: 'ERROR', // Mark as error since it no longer exists in Shopify
      lastSyncedAt: new Date(),
    },
  });

  console.log(`Company marked as deleted: ${shopifyCompanyId}`);
}

async function handleCompanyLocationUpdate(
  shopId: string,
  payload: ShopifyCompanyLocationWebhookPayload
) {
  const shopifyCompanyId = `gid://shopify/Company/${payload.company_id}`;
  const shopifyLocationId = `gid://shopify/CompanyLocation/${payload.id}`;

  // Get zipcode from shipping address
  const zipcode = payload.shipping_address?.zip || payload.billing_address?.zip || null;

  // Find the company
  const company = await prisma.company.findFirst({
    where: {
      shopId,
      shopifyCompanyId,
    },
  });

  if (!company) {
    console.log(`Company not found for location update: ${shopifyCompanyId}`);
    return;
  }

  // Create or update the company location
  await prisma.companyLocation.upsert({
    where: {
      companyId_shopifyLocationId: {
        companyId: company.id,
        shopifyLocationId,
      },
    },
    update: {
      name: payload.name,
      zipcode,
      address1: payload.shipping_address?.address1 || payload.billing_address?.address1 || null,
      address2: payload.shipping_address?.address2 || payload.billing_address?.address2 || null,
      city: payload.shipping_address?.city || payload.billing_address?.city || null,
      provinceCode: payload.shipping_address?.province_code || payload.billing_address?.province_code || null,
      countryCode: payload.shipping_address?.country_code || payload.billing_address?.country_code || 'US',
    },
    create: {
      companyId: company.id,
      shopifyLocationId,
      name: payload.name,
      zipcode,
      address1: payload.shipping_address?.address1 || payload.billing_address?.address1 || null,
      address2: payload.shipping_address?.address2 || payload.billing_address?.address2 || null,
      city: payload.shipping_address?.city || payload.billing_address?.city || null,
      provinceCode: payload.shipping_address?.province_code || payload.billing_address?.province_code || null,
      countryCode: payload.shipping_address?.country_code || payload.billing_address?.country_code || 'US',
    },
  });

  // Auto-assign territory if zipcode exists
  if (zipcode && !company.territoryId) {
    // Find territory that contains this zipcode
    const territoryZipcode = await prisma.territoryZipcode.findFirst({
      where: {
        zipcode,
        territory: {
          shopId,
          isActive: true,
        },
      },
      include: {
        territory: true,
      },
    });

    if (territoryZipcode) {
      await prisma.company.update({
        where: { id: company.id },
        data: {
          territoryId: territoryZipcode.territoryId,
        },
      });
      console.log(`Auto-assigned territory: ${territoryZipcode.territory.name} for zipcode ${zipcode}`);
    }
  }

  console.log(`Company location updated: ${shopifyLocationId}`);
}
