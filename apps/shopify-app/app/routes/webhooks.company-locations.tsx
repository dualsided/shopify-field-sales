import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processCompanyLocationWebhook } from "../services/webhook.server";
import { syncCompanyDetails } from "../services/companySync.server";

interface CompanyLocationPayload {
  id: number;
  company_id: number;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  const locationPayload = payload as unknown as CompanyLocationPayload;

  if (topic === "COMPANY_LOCATIONS_DELETE") {
    // Use the existing delete handler
    const result = await processCompanyLocationWebhook(shop, topic, payload);
    if (!result.success) {
      console.error(`[Webhook] Failed to process ${topic}:`, result.error);
    }
  } else {
    // For create/update, sync the entire company to get payment terms via GraphQL
    const shopifyCompanyId = String(locationPayload.company_id);
    const result = await syncCompanyDetails(shop, shopifyCompanyId);
    if (!result.success) {
      console.error(`[Webhook] Failed to sync company for location:`, result.error);
    }
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
