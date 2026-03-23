import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processDraftOrderWebhook } from "../services/order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  // Process draft order webhooks (DRAFT_ORDERS_UPDATE, etc.)
  const result = await processDraftOrderWebhook(shop, topic, payload as Parameters<typeof processDraftOrderWebhook>[2]);

  if (!result.success) {
    console.error(`[Webhook] Failed to process ${topic}:`, result.error);
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
