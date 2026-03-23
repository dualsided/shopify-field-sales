import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { Shop } from "@prisma/client";

export interface AuthenticatedShop {
  shop: Shop;
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
}

/**
 * Authenticates the request and returns the shop record.
 * Use this in loaders and actions to get the authenticated shop.
 */
export async function getAuthenticatedShop(
  request: Request
): Promise<AuthenticatedShop> {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  return { shop, session };
}

/**
 * Gets the shop if it exists, returns null otherwise.
 * Use this when you want to handle missing shop gracefully.
 */
export async function getShopOrNull(
  request: Request
): Promise<{ shop: Shop | null; session: Awaited<ReturnType<typeof authenticate.admin>>["session"] }> {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  return { shop, session };
}
