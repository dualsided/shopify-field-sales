import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getTerritories } from "../services/territory.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);

    const territories = await getTerritories(shop.id);

    // Filter to only active territories by default
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const filteredTerritories = includeInactive
      ? territories
      : territories.filter((t) => t.isActive);

    return Response.json({
      territories: filteredTerritories.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        stateCount: t.stateCount,
        zipcodeCount: t.zipcodeCount,
        locationCount: t.locationCount,
        repCount: t.repCount,
      })),
    });
  } catch (error) {
    console.error("Error loading territories:", error);
    return Response.json({ territories: [] });
  }
};
