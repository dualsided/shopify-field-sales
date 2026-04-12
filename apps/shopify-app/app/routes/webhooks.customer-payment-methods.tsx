import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncCustomerPaymentMethodsWebhook } from "../services/companySync.server";

interface CustomerPaymentMethodPayload {
  admin_graphql_api_customer_id: string;
  admin_graphql_api_id: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  const methodPayload = payload as unknown as CustomerPaymentMethodPayload;

  // Extract numeric customer ID from GID
  // Format: "gid://shopify/Customer/123456"
  const customerGid = methodPayload.admin_graphql_api_customer_id;
  const shopifyCustomerId = customerGid?.split("/").pop() || "";

  if (!shopifyCustomerId) {
    console.error(`[Webhook] No customer ID in payment method payload`);
    return new Response(null, { status: 200 });
  }

  // Sync payment methods for this customer
  const result = await syncCustomerPaymentMethodsWebhook(shop, shopifyCustomerId);

  if (!result.success) {
    console.error(`[Webhook] Failed to sync payment methods:`, result.error);
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
