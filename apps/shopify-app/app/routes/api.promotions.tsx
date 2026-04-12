import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getPromotions } from "../services/promotion.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);
    const promotions = await getPromotions(shop.id);

    // Only return active promotions that are within their date range
    const now = new Date();
    const activePromotions = promotions.filter((p) => {
      if (!p.isActive) return false;
      if (p.startsAt > now) return false;
      if (p.endsAt && p.endsAt < now) return false;
      return true;
    });

    return Response.json({
      promotions: activePromotions.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        type: p.type,
        value: Number(p.value),
        minOrderCents: p.minOrderCents,
        buyQuantity: p.buyQuantity,
        buyProductIds: p.buyProductIds,
        getQuantity: p.getQuantity,
        getProductIds: p.getProductIds,
        stackable: p.stackable,
        priority: p.priority,
      })),
    });
  } catch (error) {
    console.error("Error loading promotions:", error);
    return Response.json({ promotions: [] });
  }
};
