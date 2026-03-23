import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyWebhook, parseWebhookBody } from '@/lib/shopify/webhook';
import { syncProductById, deleteProduct } from '@/services/product-sync';

interface ShopifyProductWebhookPayload {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  status: 'active' | 'archived' | 'draft';
  variants: Array<{
    id: number;
    title: string;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    inventory_quantity: number | null;
    position: number;
  }>;
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
      return NextResponse.json({ received: true, status: 'shop_not_found' });
    }

    // Handle different webhook topics
    switch (topic) {
      case 'products/create':
      case 'products/update': {
        const payload = parseWebhookBody<ShopifyProductWebhookPayload>(rawBody);
        if (!payload) {
          console.error('Invalid webhook payload');
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        // Sync the product using GraphQL (gets full data including images)
        const shopifyProductId = `gid://shopify/Product/${payload.id}`;
        await syncProductById(shopRecord.id, shopifyProductId);
        console.log(`Product ${topic}: ${payload.title} (${shopifyProductId})`);
        break;
      }

      case 'products/delete': {
        const payload = parseWebhookBody<{ id: number }>(rawBody);
        if (!payload) {
          console.error('Invalid webhook payload');
          return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const shopifyProductId = `gid://shopify/Product/${payload.id}`;
        await deleteProduct(shopRecord.id, shopifyProductId);
        console.log(`Product deleted: ${shopifyProductId}`);
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
