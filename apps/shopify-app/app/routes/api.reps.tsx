import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getSalesReps } from "../services/salesRep.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);

    const reps = await getSalesReps(shop.id);

    // Filter to only active reps by default
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    const filteredReps = includeInactive
      ? reps
      : reps.filter((r) => r.isActive);

    return Response.json({
      reps: filteredReps.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
        phone: r.phone,
        role: r.role,
        territoryCount: r.territoryCount,
      })),
    });
  } catch (error) {
    console.error("Error loading sales reps:", error);
    return Response.json({ reps: [] });
  }
};
