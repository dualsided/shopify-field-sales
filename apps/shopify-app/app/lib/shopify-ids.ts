/**
 * Shopify GID Utilities
 *
 * We store only the numeric portion of Shopify IDs in the database.
 * These helpers convert between numeric IDs and full GIDs for GraphQL queries.
 *
 * Example:
 *   Database: "626000042"
 *   GraphQL GID: "gid://shopify/Company/626000042"
 */

export type ShopifyResourceType =
  | "Company"
  | "CompanyLocation"
  | "Product"
  | "ProductVariant"
  | "Order"
  | "DraftOrder"
  | "Customer";

/**
 * Convert a numeric ID to a Shopify GID for GraphQL queries
 * @param type - The Shopify resource type
 * @param id - The numeric ID (as string or number)
 * @returns Full GID string for GraphQL
 */
export function toGid(type: ShopifyResourceType, id: string | number): string {
  return `gid://shopify/${type}/${id}`;
}

/**
 * Extract the numeric ID from a Shopify GID
 * @param gid - Full GID string (e.g., "gid://shopify/Company/626000042")
 * @returns Numeric ID as string (e.g., "626000042")
 */
export function fromGid(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

/**
 * Check if a string is a Shopify GID format
 */
export function isGid(value: string): boolean {
  return value.startsWith("gid://shopify/");
}

/**
 * Ensure we have a numeric ID (extract from GID if necessary)
 * Useful when receiving IDs that might be in either format
 */
export function ensureNumericId(idOrGid: string): string {
  if (isGid(idOrGid)) {
    return fromGid(idOrGid);
  }
  return idOrGid;
}
