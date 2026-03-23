import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processOrderWebhook } from "../services/order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  // Process order webhooks (ORDERS_CREATE, ORDERS_PAID, etc.)
  const result = await processOrderWebhook(shop, topic, payload as Parameters<typeof processOrderWebhook>[2]);

  if (!result.success) {
    console.error(`[Webhook] Failed to process ${topic}:`, result.error);
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
