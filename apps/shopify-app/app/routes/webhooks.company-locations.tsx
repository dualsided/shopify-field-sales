import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processCompanyLocationWebhook } from "../services/webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  const result = await processCompanyLocationWebhook(shop, topic, payload);

  if (!result.success) {
    console.error(`[Webhook] Failed to process ${topic}:`, result.error);
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
