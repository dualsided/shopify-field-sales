import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getCompanies } from "../services/company.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);
    const { companies } = await getCompanies(shop.id);

    return Response.json({
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        accountNumber: c.accountNumber,
        territoryNames: c.territoryNames,
      })),
    });
  } catch (error) {
    console.error("Error loading companies:", error);
    return Response.json({ companies: [] });
  }
};
