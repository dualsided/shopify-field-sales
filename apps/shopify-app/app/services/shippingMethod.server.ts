import prisma from "../db.server";
import type { ShippingMethod } from "@field-sales/database";

export type { ShippingMethod };

export interface CreateShippingMethodInput {
  shopId: string;
  title: string;
  method: string;
  priceCents: number;
}

export interface UpdateShippingMethodInput {
  title?: string;
  method?: string;
  priceCents?: number;
  isActive?: boolean;
  position?: number;
}

/**
 * Get all shipping methods for a shop
 */
export async function getShippingMethods(shopId: string): Promise<ShippingMethod[]> {
  return prisma.shippingMethod.findMany({
    where: { shopId },
    orderBy: { position: "asc" },
  });
}

/**
 * Get active shipping methods for a shop (for order form)
 */
export async function getActiveShippingMethods(shopId: string): Promise<ShippingMethod[]> {
  return prisma.shippingMethod.findMany({
    where: { shopId, isActive: true },
    orderBy: { position: "asc" },
  });
}

/**
 * Get a single shipping method by ID
 */
export async function getShippingMethod(id: string): Promise<ShippingMethod | null> {
  return prisma.shippingMethod.findUnique({
    where: { id },
  });
}

/**
 * Create a new shipping method
 */
export async function createShippingMethod(
  input: CreateShippingMethodInput
): Promise<ShippingMethod> {
  // Get the max position to add new method at the end
  const maxPosition = await prisma.shippingMethod.aggregate({
    where: { shopId: input.shopId },
    _max: { position: true },
  });

  return prisma.shippingMethod.create({
    data: {
      ...input,
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });
}

/**
 * Update a shipping method
 */
export async function updateShippingMethod(
  id: string,
  input: UpdateShippingMethodInput
): Promise<ShippingMethod> {
  return prisma.shippingMethod.update({
    where: { id },
    data: input,
  });
}

/**
 * Delete a shipping method
 */
export async function deleteShippingMethod(id: string): Promise<void> {
  await prisma.shippingMethod.delete({
    where: { id },
  });
}

/**
 * Reorder shipping methods
 */
export async function reorderShippingMethods(
  shopId: string,
  orderedIds: string[]
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.shippingMethod.update({
        where: { id },
        data: { position: index },
      })
    )
  );
}
