import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticatedShop } from "../services/shop.server";
import { getEnabledProducts, searchProducts } from "../services/product.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);

    const url = new URL(request.url);
    const query = url.searchParams.get("q");

    const products = query
      ? await searchProducts(shop.id, query)
      : await getEnabledProducts(shop.id);

    return Response.json({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    return Response.json({ products: [], error: "Failed to fetch products" }, { status: 500 });
  }
};
