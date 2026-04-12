import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getShippingMethods } from "../services/shippingMethod.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);
    const shippingMethods = await getShippingMethods(shop.id);

    return Response.json({
      shippingMethods: shippingMethods.map((sm) => ({
        id: sm.id,
        title: sm.title,
        method: sm.method,
        priceCents: sm.priceCents,
      })),
    });
  } catch (error) {
    console.error("Error loading shipping methods:", error);
    return Response.json({ shippingMethods: [] });
  }
};
