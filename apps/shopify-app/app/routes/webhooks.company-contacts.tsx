import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncCompanyDetails } from "../services/companySync.server";
import { prisma } from "@field-sales/database";

interface CompanyContactPayload {
  id: number;
  company_id: number;
  customer_admin_graphql_api_id?: string;
  is_main_contact?: boolean;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  const contactPayload = payload as unknown as CompanyContactPayload;
  const shopifyCompanyId = String(contactPayload.company_id);
  const shopifyContactId = String(contactPayload.id);

  if (topic === "COMPANY_CONTACTS_DELETE") {
    // Delete contact from our database
    try {
      const shopRecord = await prisma.shop.findUnique({
        where: { shopifyDomain: shop },
      });

      if (shopRecord) {
        const company = await prisma.company.findFirst({
          where: {
            shopId: shopRecord.id,
            shopifyCompanyId,
          },
        });

        if (company) {
          await prisma.companyContact.deleteMany({
            where: {
              companyId: company.id,
              shopifyContactId,
            },
          });
          console.log(`[Webhook] Contact ${shopifyContactId} deleted`);
        }
      }
    } catch (error) {
      console.error(`[Webhook] Error deleting contact:`, error);
    }
  } else {
    // For create/update, sync the entire company to get full contact details
    const result = await syncCompanyDetails(shop, shopifyCompanyId);

    if (!result.success) {
      console.error(`[Webhook] Failed to sync company for contact:`, result.error);
    }
  }

  // Always return 200 to acknowledge receipt
  return new Response(null, { status: 200 });
};
