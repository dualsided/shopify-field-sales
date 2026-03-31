import prisma from "../db.server";
import type { OrderStatus, PaymentTerms } from "@prisma/client";
import { toGid, fromGid } from "../lib/shopify-ids";
import { recordBilledOrder, getCurrentBillingPeriod, PLAN_CONFIGS } from "./billing.server";

// Types
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  companyId: string;
  companyName: string;
  salesRepName: string;
  totalCents: number;
  currency: string;
  lineItemCount: number;
  createdAt: string;
  placedAt: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  shopifyDraftOrderId: string | null;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  company: {
    id: string;
    name: string;
    accountNumber: string | null;
  };
  salesRep: {
    id: string;
    name: string;
  };
  contact: {
    id: string;
    name: string;
    email: string;
  } | null;
  shippingLocation: OrderAddress | null;
  billingLocation: OrderAddress | null;
  lineItems: OrderLineItemDetail[];
  note: string | null;
  poNumber: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  paymentTerms: PaymentTerms;
  paymentDueDate: string | null;
  paidAt: string | null;
  placedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderAddress {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string;
  countryCode: string;
  phone: string | null;
}

export interface OrderLineItemDetail {
  id: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  fulfilledQuantity: number;
}

export interface CreateOrderInput {
  shopId: string;
  companyId: string;
  salesRepId: string;
  contactId?: string | null;
  shippingLocationId?: string | null;
  billingLocationId?: string | null;
  note?: string | null;
  poNumber?: string | null;
  paymentTerms?: PaymentTerms;
  lineItems: CreateLineItemInput[];
}

export interface CreateLineItemInput {
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  sku?: string | null;
  title: string;
  variantTitle?: string | null;
  quantity: number;
  unitPriceCents: number;
}

export interface UpdateOrderInput {
  contactId?: string | null;
  shippingLocationId?: string | null;
  billingLocationId?: string | null;
  note?: string | null;
  poNumber?: string | null;
  paymentTerms?: PaymentTerms;
}

export interface UpdateLineItemInput {
  id?: string; // If provided, update existing; otherwise create new
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  sku?: string | null;
  title: string;
  variantTitle?: string | null;
  quantity: number;
  unitPriceCents: number;
}

// Helper to generate order number
async function generateOrderNumber(shopId: string): Promise<string> {
  const count = await prisma.order.count({ where: { shopId } });
  const paddedNumber = String(count + 1).padStart(6, "0");
  return `ORD-${paddedNumber}`;
}

// Helper to calculate line item total
function calculateLineItemTotal(item: { quantity: number; unitPriceCents: number; discountCents?: number; taxCents?: number }): number {
  const subtotal = item.quantity * item.unitPriceCents;
  const discount = item.discountCents || 0;
  const tax = item.taxCents || 0;
  return subtotal - discount + tax;
}

// Helper to calculate order totals
function calculateOrderTotals(lineItems: Array<{ quantity: number; unitPriceCents: number; discountCents?: number; taxCents?: number }>) {
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;

  for (const item of lineItems) {
    subtotalCents += item.quantity * item.unitPriceCents;
    discountCents += item.discountCents || 0;
    taxCents += item.taxCents || 0;
  }

  const totalCents = subtotalCents - discountCents + taxCents;

  return { subtotalCents, discountCents, taxCents, totalCents };
}

// Queries
export async function getOrders(
  shopId: string,
  options?: {
    salesRepId?: string;
    companyId?: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }
): Promise<OrderListItem[]> {
  const orders = await prisma.order.findMany({
    where: {
      shopId,
      ...(options?.salesRepId && { salesRepId: options.salesRepId }),
      ...(options?.companyId && { companyId: options.companyId }),
      ...(options?.status && { status: options.status }),
    },
    include: {
      company: { select: { name: true } },
      salesRep: { select: { firstName: true, lastName: true } },
      lineItems: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    companyId: o.companyId,
    companyName: o.company.name,
    salesRepName: `${o.salesRep.firstName} ${o.salesRep.lastName}`,
    totalCents: o.totalCents,
    currency: o.currency,
    lineItemCount: o.lineItems.length,
    createdAt: o.createdAt.toISOString(),
    placedAt: o.placedAt?.toISOString() || null,
  }));
}

export async function getOrderById(
  shopId: string,
  orderId: string
): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    include: {
      company: { select: { id: true, name: true, accountNumber: true } },
      salesRep: { select: { id: true, firstName: true, lastName: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      shippingLocation: true,
      billingLocation: true,
      lineItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    shopifyDraftOrderId: order.shopifyDraftOrderId,
    shopifyOrderId: order.shopifyOrderId,
    shopifyOrderNumber: order.shopifyOrderNumber,
    company: {
      id: order.company.id,
      name: order.company.name,
      accountNumber: order.company.accountNumber,
    },
    salesRep: {
      id: order.salesRep.id,
      name: `${order.salesRep.firstName} ${order.salesRep.lastName}`,
    },
    contact: order.contact
      ? {
          id: order.contact.id,
          name: `${order.contact.firstName} ${order.contact.lastName}`,
          email: order.contact.email,
        }
      : null,
    shippingLocation: order.shippingLocation
      ? {
          id: order.shippingLocation.id,
          name: order.shippingLocation.name,
          address1: order.shippingLocation.address1,
          address2: order.shippingLocation.address2,
          city: order.shippingLocation.city,
          province: order.shippingLocation.province,
          provinceCode: order.shippingLocation.provinceCode,
          zipcode: order.shippingLocation.zipcode,
          country: order.shippingLocation.country,
          countryCode: order.shippingLocation.countryCode,
          phone: order.shippingLocation.phone,
        }
      : null,
    billingLocation: order.billingLocation
      ? {
          id: order.billingLocation.id,
          name: order.billingLocation.name,
          address1: order.billingLocation.address1,
          address2: order.billingLocation.address2,
          city: order.billingLocation.city,
          province: order.billingLocation.province,
          provinceCode: order.billingLocation.provinceCode,
          zipcode: order.billingLocation.zipcode,
          country: order.billingLocation.country,
          countryCode: order.billingLocation.countryCode,
          phone: order.billingLocation.phone,
        }
      : null,
    lineItems: order.lineItems.map((li) => ({
      id: li.id,
      shopifyProductId: li.shopifyProductId,
      shopifyVariantId: li.shopifyVariantId,
      sku: li.sku,
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      unitPriceCents: li.unitPriceCents,
      discountCents: li.discountCents,
      taxCents: li.taxCents,
      totalCents: li.totalCents,
      fulfilledQuantity: li.fulfilledQuantity,
    })),
    note: order.note,
    poNumber: order.poNumber,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    currency: order.currency,
    paymentTerms: order.paymentTerms,
    paymentDueDate: order.paymentDueDate?.toISOString() || null,
    paidAt: order.paidAt?.toISOString() || null,
    placedAt: order.placedAt?.toISOString() || null,
    cancelledAt: order.cancelledAt?.toISOString() || null,
    refundedAt: order.refundedAt?.toISOString() || null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export async function getOrdersBySalesRep(
  shopId: string,
  salesRepId: string,
  options?: { status?: OrderStatus; limit?: number }
): Promise<OrderListItem[]> {
  return getOrders(shopId, { salesRepId, ...options });
}

export async function getOrdersByCompany(
  shopId: string,
  companyId: string,
  options?: { status?: OrderStatus; limit?: number }
): Promise<OrderListItem[]> {
  return getOrders(shopId, { companyId, ...options });
}

// Mutations
export async function createOrder(
  input: CreateOrderInput
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  const { shopId, companyId, salesRepId, contactId, shippingLocationId, billingLocationId, note, poNumber, paymentTerms, lineItems } = input;

  if (lineItems.length === 0) {
    return { success: false, error: "Order must have at least one line item" };
  }

  // Verify company exists and belongs to shop
  const company = await prisma.company.findFirst({
    where: { id: companyId, shopId, isActive: true },
  });

  if (!company) {
    return { success: false, error: "Company not found" };
  }

  // Verify sales rep exists and belongs to shop
  const salesRep = await prisma.salesRep.findFirst({
    where: { id: salesRepId, shopId, isActive: true },
  });

  if (!salesRep) {
    return { success: false, error: "Sales rep not found" };
  }

  try {
    const orderNumber = await generateOrderNumber(shopId);
    const totals = calculateOrderTotals(lineItems);

    const order = await prisma.order.create({
      data: {
        shopId,
        companyId,
        salesRepId,
        contactId: contactId || null,
        shippingLocationId: shippingLocationId || null,
        billingLocationId: billingLocationId || null,
        orderNumber,
        status: "DRAFT",
        note: note || null,
        poNumber: poNumber || null,
        paymentTerms: paymentTerms || company.paymentTerms,
        ...totals,
        lineItems: {
          create: lineItems.map((li) => ({
            shopifyProductId: li.shopifyProductId || null,
            shopifyVariantId: li.shopifyVariantId || null,
            sku: li.sku || null,
            title: li.title,
            variantTitle: li.variantTitle || null,
            quantity: li.quantity,
            unitPriceCents: li.unitPriceCents,
            totalCents: calculateLineItemTotal(li),
          })),
        },
      },
    });

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Error creating order:", error);
    return { success: false, error: "Failed to create order" };
  }
}

export async function updateOrder(
  shopId: string,
  orderId: string,
  input: UpdateOrderInput
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status !== "DRAFT") {
    return { success: false, error: "Can only update draft orders" };
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(input.contactId !== undefined && { contactId: input.contactId || null }),
        ...(input.shippingLocationId !== undefined && { shippingLocationId: input.shippingLocationId || null }),
        ...(input.billingLocationId !== undefined && { billingLocationId: input.billingLocationId || null }),
        ...(input.note !== undefined && { note: input.note || null }),
        ...(input.poNumber !== undefined && { poNumber: input.poNumber || null }),
        ...(input.paymentTerms && { paymentTerms: input.paymentTerms }),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating order:", error);
    return { success: false, error: "Failed to update order" };
  }
}

export async function updateOrderLineItems(
  shopId: string,
  orderId: string,
  lineItems: UpdateLineItemInput[]
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    include: { lineItems: true },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status !== "DRAFT") {
    return { success: false, error: "Can only update line items on draft orders" };
  }

  if (lineItems.length === 0) {
    return { success: false, error: "Order must have at least one line item" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Get existing line item IDs
      const existingIds = new Set(order.lineItems.map((li) => li.id));
      const newIds = new Set(lineItems.filter((li) => li.id).map((li) => li.id));

      // Delete removed items
      const toDelete = [...existingIds].filter((id) => !newIds.has(id));
      if (toDelete.length > 0) {
        await tx.orderLineItem.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      // Update existing and create new items
      for (const li of lineItems) {
        const totalCents = calculateLineItemTotal(li);

        if (li.id && existingIds.has(li.id)) {
          await tx.orderLineItem.update({
            where: { id: li.id },
            data: {
              shopifyProductId: li.shopifyProductId || null,
              shopifyVariantId: li.shopifyVariantId || null,
              sku: li.sku || null,
              title: li.title,
              variantTitle: li.variantTitle || null,
              quantity: li.quantity,
              unitPriceCents: li.unitPriceCents,
              totalCents,
            },
          });
        } else {
          await tx.orderLineItem.create({
            data: {
              orderId,
              shopifyProductId: li.shopifyProductId || null,
              shopifyVariantId: li.shopifyVariantId || null,
              sku: li.sku || null,
              title: li.title,
              variantTitle: li.variantTitle || null,
              quantity: li.quantity,
              unitPriceCents: li.unitPriceCents,
              totalCents,
            },
          });
        }
      }

      // Recalculate order totals
      const totals = calculateOrderTotals(lineItems);
      await tx.order.update({
        where: { id: orderId },
        data: totals,
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating order line items:", error);
    return { success: false, error: "Failed to update line items" };
  }
}

export async function cancelOrder(
  shopId: string,
  orderId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { success: false, error: "Order is already cancelled or refunded" };
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error cancelling order:", error);
    return { success: false, error: "Failed to cancel order" };
  }
}

export async function deleteOrder(
  shopId: string,
  orderId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status !== "DRAFT") {
    return { success: false, error: "Can only delete draft orders" };
  }

  try {
    await prisma.order.delete({
      where: { id: orderId },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting order:", error);
    return { success: false, error: "Failed to delete order" };
  }
}

// =============================================================================
// Shopify Draft Order Integration
// =============================================================================

// GraphQL Mutations for Draft Orders
const DRAFT_ORDER_CREATE_MUTATION = `#graphql
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
        status
        totalPrice
        subtotalPrice
        totalTax
        currencyCode
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              originalUnitPrice
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_UPDATE_MUTATION = `#graphql
  mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder {
        id
        name
        status
        totalPrice
        subtotalPrice
        totalTax
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_COMPLETE_MUTATION = `#graphql
  mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        order {
          id
          name
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_DELETE_MUTATION = `#graphql
  mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_QUERY = `#graphql
  query GetDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      id
      name
      status
      invoiceUrl
      totalPrice
      subtotalPrice
      totalTax
      currencyCode
      order {
        id
        name
      }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            originalUnitPrice
            variant {
              id
            }
            product {
              id
            }
          }
        }
      }
    }
  }
`;

const DRAFT_ORDER_INVOICE_SEND_MUTATION = `#graphql
  mutation DraftOrderInvoiceSend($id: ID!, $email: DraftOrderInvoiceInput) {
    draftOrderInvoiceSend(id: $id, email: $email) {
      draftOrder {
        id
        status
        invoiceUrl
        invoiceSentAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Complete draft order with a vaulted payment method
const DRAFT_ORDER_COMPLETE_WITH_PAYMENT_MUTATION = `#graphql
  mutation DraftOrderComplete($id: ID!, $paymentGatewayId: ID, $paymentPending: Boolean, $sourceName: String) {
    draftOrderComplete(id: $id, paymentGatewayId: $paymentGatewayId, paymentPending: $paymentPending, sourceName: $sourceName) {
      draftOrder {
        id
        order {
          id
          name
          displayFinancialStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Create order directly with payment method (alternative to draft order flow)
const ORDER_CREATE_MUTATION = `#graphql
  mutation OrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        displayFinancialStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Types for Shopify admin API
interface ShopifyAdmin {
  graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response>;
}

interface DraftOrderLineItemInput {
  variantId?: string;
  title: string;
  quantity: number;
  originalUnitPrice: string;
  sku?: string;
}

// Sync local order to Shopify as Draft Order
export async function syncOrderToShopifyDraft(
  shopId: string,
  orderId: string,
  admin: ShopifyAdmin
): Promise<{ success: true; shopifyDraftOrderId: string } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    include: {
      company: { select: { shopifyCompanyId: true, name: true } },
      contact: { select: { shopifyCustomerId: true, email: true, firstName: true, lastName: true } },
      shippingLocation: true,
      billingLocation: true,
      lineItems: true,
    },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status !== "DRAFT") {
    return { success: false, error: "Only draft orders can be synced to Shopify" };
  }

  try {
    // Build line items for Shopify (convert numeric IDs to GIDs for GraphQL)
    const lineItems: DraftOrderLineItemInput[] = order.lineItems.map((li) => ({
      ...(li.shopifyVariantId && { variantId: toGid("ProductVariant", li.shopifyVariantId) }),
      title: li.title,
      quantity: li.quantity,
      originalUnitPrice: (li.unitPriceCents / 100).toFixed(2),
      ...(li.sku && { sku: li.sku }),
    }));

    // Build shipping address if available
    const shippingAddress = order.shippingLocation
      ? {
          address1: order.shippingLocation.address1 || "",
          address2: order.shippingLocation.address2 || undefined,
          city: order.shippingLocation.city || "",
          province: order.shippingLocation.province || "",
          zip: order.shippingLocation.zipcode || "",
          country: order.shippingLocation.countryCode || "US",
          phone: order.shippingLocation.phone || undefined,
        }
      : undefined;

    // Build billing address if available
    const billingAddress = order.billingLocation
      ? {
          address1: order.billingLocation.address1 || "",
          address2: order.billingLocation.address2 || undefined,
          city: order.billingLocation.city || "",
          province: order.billingLocation.province || "",
          zip: order.billingLocation.zipcode || "",
          country: order.billingLocation.countryCode || "US",
          phone: order.billingLocation.phone || undefined,
        }
      : undefined;

    // Build input for Shopify
    const input: Record<string, unknown> = {
      lineItems,
      note: order.note || undefined,
      poNumber: order.poNumber || undefined,
      ...(shippingAddress && { shippingAddress }),
      ...(billingAddress && { billingAddress }),
    };

    // Add customer if contact has Shopify customer ID (convert to GID for GraphQL)
    if (order.contact?.shopifyCustomerId) {
      input.purchasingEntity = {
        customerId: toGid("Customer", order.contact.shopifyCustomerId),
      };
    }

    let response: Response;
    let result: {
      data?: {
        draftOrderCreate?: {
          draftOrder?: { id: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
        draftOrderUpdate?: {
          draftOrder?: { id: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
    };

    // If order already has a Shopify draft order ID, update it; otherwise create new
    if (order.shopifyDraftOrderId) {
      response = await admin.graphql(DRAFT_ORDER_UPDATE_MUTATION, {
        variables: { id: toGid("DraftOrder", order.shopifyDraftOrderId), input },
      });
      result = await response.json();

      if (result.data?.draftOrderUpdate?.userErrors?.length) {
        const errors = result.data.draftOrderUpdate.userErrors;
        console.error("Shopify draft order update errors:", errors);
        return { success: false, error: errors.map((e) => e.message).join(", ") };
      }

      return { success: true, shopifyDraftOrderId: order.shopifyDraftOrderId };
    } else {
      response = await admin.graphql(DRAFT_ORDER_CREATE_MUTATION, {
        variables: { input },
      });
      result = await response.json();

      if (result.data?.draftOrderCreate?.userErrors?.length) {
        const errors = result.data.draftOrderCreate.userErrors;
        console.error("Shopify draft order create errors:", errors);
        return { success: false, error: errors.map((e) => e.message).join(", ") };
      }

      const shopifyDraftOrderGid = result.data?.draftOrderCreate?.draftOrder?.id;
      if (!shopifyDraftOrderGid) {
        return { success: false, error: "Failed to create draft order in Shopify" };
      }

      // Extract numeric ID from GID for storage
      const shopifyDraftOrderId = fromGid(shopifyDraftOrderGid);

      // Update local order with Shopify draft order ID (status stays DRAFT until invoice sent)
      await prisma.order.update({
        where: { id: orderId },
        data: {
          shopifyDraftOrderId,
        },
      });

      return { success: true, shopifyDraftOrderId };
    }
  } catch (error) {
    console.error("Error syncing order to Shopify:", error);
    return { success: false, error: "Failed to sync order to Shopify" };
  }
}

// Complete a draft order in Shopify (convert to real order)
export async function completeDraftOrder(
  shopId: string,
  orderId: string,
  admin: ShopifyAdmin,
  paymentPending: boolean = false
): Promise<{ success: true; shopifyOrderId: string; shopifyOrderNumber: string } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (!order.shopifyDraftOrderId) {
    return { success: false, error: "Order has not been synced to Shopify yet" };
  }

  if (order.status !== "PENDING") {
    return { success: false, error: "Only pending orders can be completed" };
  }

  try {
    const response = await admin.graphql(DRAFT_ORDER_COMPLETE_MUTATION, {
      variables: {
        id: toGid("DraftOrder", order.shopifyDraftOrderId),
        paymentPending,
      },
    });

    const result: {
      data?: {
        draftOrderComplete?: {
          draftOrder?: {
            order?: {
              id: string;
              name: string;
            };
          };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
    } = await response.json();

    if (result.data?.draftOrderComplete?.userErrors?.length) {
      const errors = result.data.draftOrderComplete.userErrors;
      console.error("Shopify draft order complete errors:", errors);
      return { success: false, error: errors.map((e) => e.message).join(", ") };
    }

    const shopifyOrder = result.data?.draftOrderComplete?.draftOrder?.order;
    if (!shopifyOrder) {
      return { success: false, error: "Failed to complete draft order in Shopify" };
    }

    // Extract numeric ID from GID for storage
    const shopifyOrderId = fromGid(shopifyOrder.id);

    // Update local order with Shopify order info
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shopifyOrderId,
        shopifyOrderNumber: shopifyOrder.name,
        status: paymentPending ? "PENDING" : "PAID",
        placedAt: new Date(),
        ...(paymentPending ? {} : { paidAt: new Date() }),
      },
    });

    return {
      success: true,
      shopifyOrderId,
      shopifyOrderNumber: shopifyOrder.name,
    };
  } catch (error) {
    console.error("Error completing draft order:", error);
    return { success: false, error: "Failed to complete order in Shopify" };
  }
}

// Delete a draft order from Shopify
export async function deleteShopifyDraftOrder(
  shopId: string,
  orderId: string,
  admin: ShopifyAdmin
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (!order.shopifyDraftOrderId) {
    // No Shopify draft order to delete
    return { success: true };
  }

  if (order.shopifyOrderId) {
    return { success: false, error: "Cannot delete draft order that has been completed" };
  }

  try {
    const response = await admin.graphql(DRAFT_ORDER_DELETE_MUTATION, {
      variables: {
        input: { id: toGid("DraftOrder", order.shopifyDraftOrderId) },
      },
    });

    const result: {
      data?: {
        draftOrderDelete?: {
          deletedId?: string;
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
    } = await response.json();

    if (result.data?.draftOrderDelete?.userErrors?.length) {
      const errors = result.data.draftOrderDelete.userErrors;
      console.error("Shopify draft order delete errors:", errors);
      return { success: false, error: errors.map((e) => e.message).join(", ") };
    }

    // Clear the Shopify draft order ID from local order
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shopifyDraftOrderId: null,
        status: "DRAFT", // Revert to draft status
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error deleting Shopify draft order:", error);
    return { success: false, error: "Failed to delete draft order from Shopify" };
  }
}

// Payment options for order submission
export interface SubmitOrderOptions {
  // If provided, charge this vaulted payment method immediately
  paymentMethodId?: string;
  // If true, send invoice email (default behavior when no paymentMethodId)
  sendInvoice?: boolean;
}

// Submit order: sync to Shopify as Draft Order
// - If paymentMethodId provided: charge the card and complete immediately
// - Otherwise: send invoice to customer (default)
export async function submitOrderForPayment(
  shopId: string,
  orderId: string,
  admin: ShopifyAdmin,
  options: SubmitOrderOptions = {}
): Promise<{
  success: true;
  shopifyDraftOrderId: string;
  invoiceUrl?: string;
  shopifyOrderId?: string;
  shopifyOrderNumber?: string;
  paymentStatus: 'invoice_sent' | 'paid' | 'pending';
} | { success: false; error: string }> {
  const { paymentMethodId, sendInvoice = true } = options;

  // First, sync the order to Shopify (creates draft order)
  const syncResult = await syncOrderToShopifyDraft(shopId, orderId, admin);
  if (!syncResult.success) {
    return syncResult;
  }

  // Get the order with contact details
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
    include: {
      contact: { select: { email: true, firstName: true, lastName: true, shopifyCustomerId: true } },
    },
  });

  if (!order) {
    return { success: false, error: "Order not found after sync" };
  }

  // ==========================================================================
  // OPTION 2: Charge vaulted payment method immediately
  // ==========================================================================
  if (paymentMethodId) {
    try {
      // Complete the draft order with the payment method
      // Note: This requires the store to have the appropriate payment gateway configured
      const response = await admin.graphql(DRAFT_ORDER_COMPLETE_WITH_PAYMENT_MUTATION, {
        variables: {
          id: toGid("DraftOrder", syncResult.shopifyDraftOrderId),
          paymentPending: false, // Payment is being collected now
          sourceName: "Field Sales App",
        },
      });

      const result: {
        data?: {
          draftOrderComplete?: {
            draftOrder?: {
              order?: {
                id: string;
                name: string;
                displayFinancialStatus: string;
              };
            };
            userErrors?: Array<{ field: string[]; message: string }>;
          };
        };
      } = await response.json();

      if (result.data?.draftOrderComplete?.userErrors?.length) {
        const errors = result.data.draftOrderComplete.userErrors;
        console.error("Draft order complete errors:", errors);
        return { success: false, error: errors.map((e) => e.message).join(", ") };
      }

      const shopifyOrder = result.data?.draftOrderComplete?.draftOrder?.order;
      if (!shopifyOrder) {
        return { success: false, error: "Failed to complete order with payment" };
      }

      // Extract numeric ID from GID for storage
      const shopifyOrderId = fromGid(shopifyOrder.id);

      // Update local order with Shopify order details
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          shopifyOrderId,
          shopifyOrderNumber: shopifyOrder.name,
          placedAt: new Date(),
          paidAt: new Date(),
        },
      });

      return {
        success: true,
        shopifyDraftOrderId: syncResult.shopifyDraftOrderId,
        shopifyOrderId,
        shopifyOrderNumber: shopifyOrder.name,
        paymentStatus: 'paid',
      };
    } catch (error) {
      console.error("Error completing order with payment:", error);
      return { success: false, error: "Failed to process payment" };
    }
  }

  // ==========================================================================
  // OPTION 1: Send invoice to customer (default)
  // ==========================================================================
  try {
    let invoiceUrl = "";

    if (sendInvoice && order.contact?.email) {
      const invoiceInput = {
        to: order.contact.email,
        subject: `Invoice for Order ${order.orderNumber}`,
        customMessage: order.note || undefined,
      };

      const response = await admin.graphql(DRAFT_ORDER_INVOICE_SEND_MUTATION, {
        variables: {
          id: toGid("DraftOrder", syncResult.shopifyDraftOrderId),
          email: invoiceInput,
        },
      });

      const result: {
        data?: {
          draftOrderInvoiceSend?: {
            draftOrder?: {
              id: string;
              invoiceUrl: string;
              invoiceSentAt: string;
            };
            userErrors?: Array<{ field: string[]; message: string }>;
          };
        };
      } = await response.json();

      if (result.data?.draftOrderInvoiceSend?.userErrors?.length) {
        const errors = result.data.draftOrderInvoiceSend.userErrors;
        console.error("Shopify invoice send errors:", errors);
        // Don't fail - draft order was created, invoice failed
      }

      invoiceUrl = result.data?.draftOrderInvoiceSend?.draftOrder?.invoiceUrl || "";
    }

    // Update order status to PENDING
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PENDING",
      },
    });

    return {
      success: true,
      shopifyDraftOrderId: syncResult.shopifyDraftOrderId,
      invoiceUrl,
      paymentStatus: sendInvoice ? 'invoice_sent' : 'pending',
    };
  } catch (error) {
    console.error("Error sending invoice:", error);
    // Draft order was created, invoice sending failed
    // Still mark as PENDING since it's in Shopify
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PENDING",
      },
    });
    return {
      success: true,
      shopifyDraftOrderId: syncResult.shopifyDraftOrderId,
      invoiceUrl: "",
      paymentStatus: 'pending',
    };
  }
}

// Get draft order status from Shopify
export async function getDraftOrderStatus(
  orderId: string,
  admin: ShopifyAdmin
): Promise<{ success: true; status: string; hasOrder: boolean; orderId?: string; orderName?: string } | { success: false; error: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (!order.shopifyDraftOrderId) {
    return { success: false, error: "Order has not been synced to Shopify" };
  }

  try {
    const response = await admin.graphql(DRAFT_ORDER_QUERY, {
      variables: { id: toGid("DraftOrder", order.shopifyDraftOrderId) },
    });

    const result: {
      data?: {
        draftOrder?: {
          id: string;
          status: string;
          order?: {
            id: string;
            name: string;
          };
        };
      };
    } = await response.json();

    const draftOrder = result.data?.draftOrder;
    if (!draftOrder) {
      return { success: false, error: "Draft order not found in Shopify" };
    }

    return {
      success: true,
      status: draftOrder.status,
      hasOrder: !!draftOrder.order,
      orderId: draftOrder.order ? fromGid(draftOrder.order.id) : undefined,
      orderName: draftOrder.order?.name,
    };
  } catch (error) {
    console.error("Error fetching draft order status:", error);
    return { success: false, error: "Failed to fetch draft order status" };
  }
}

// Mark order as paid (after payment received)
export async function markOrderPaid(
  shopId: string,
  orderId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { success: false, error: "Cannot mark cancelled or refunded order as paid" };
  }

  if (order.status === "PAID") {
    return { success: true }; // Already paid
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });

    // Record for billing revenue share (only if shop has active billing)
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { billingPlan: true, billingStatus: true },
    });

    if (shop?.billingPlan && (shop.billingStatus === "ACTIVE" || shop.billingStatus === "TRIAL")) {
      const billingPeriod = await getCurrentBillingPeriod(shopId);
      if (billingPeriod) {
        const planConfig = PLAN_CONFIGS[shop.billingPlan];
        await recordBilledOrder(orderId, billingPeriod.id, planConfig.revenueSharePercent);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error marking order as paid:", error);
    return { success: false, error: "Failed to mark order as paid" };
  }
}

// =============================================================================
// Webhook Handlers
// =============================================================================

interface OrderWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  financial_status: string;
  source_name?: string;
  note_attributes?: Array<{ name: string; value: string }>;
}

interface DraftOrderWebhookPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  status: string;
  order_id?: number;
}

// Process ORDERS_CREATE or ORDERS_PAID webhook
// When a draft order is completed, Shopify creates an order - we need to link it
export async function processOrderWebhook(
  shopDomain: string,
  topic: string,
  payload: OrderWebhookPayload
): Promise<{ success: true } | { success: false; error: string }> {
  console.log(`[Order Webhook] Processing ${topic} for order ${payload.name}`);

  try {
    // Find shop with billing info
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: {
        id: true,
        billingPlan: true,
        billingStatus: true,
      },
    });

    if (!shop) {
      console.log(`[Order Webhook] Shop not found: ${shopDomain}`);
      return { success: false, error: "Shop not found" };
    }

    // Extract numeric ID from GID for storage/lookup
    const shopifyOrderId = fromGid(payload.admin_graphql_api_id);

    // First, check if we already have an order linked to this Shopify order
    let order = await prisma.order.findFirst({
      where: { shopId: shop.id, shopifyOrderId },
    });

    if (order) {
      // Order already linked, update status based on webhook topic
      if (topic === "ORDERS_PAID" && order.status !== "PAID") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
          },
        });
        console.log(`[Order Webhook] Marked order ${order.orderNumber} as PAID`);

        // Record for billing revenue share
        if (shop.billingPlan && (shop.billingStatus === "ACTIVE" || shop.billingStatus === "TRIAL")) {
          const billingPeriod = await getCurrentBillingPeriod(shop.id);
          if (billingPeriod) {
            const planConfig = PLAN_CONFIGS[shop.billingPlan];
            await recordBilledOrder(order.id, billingPeriod.id, planConfig.revenueSharePercent);
            console.log(`[Order Webhook] Recorded billed order for revenue share`);
          }
        }
      } else if (topic === "ORDERS_CANCELLED" && order.status !== "CANCELLED") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
          },
        });
        console.log(`[Order Webhook] Marked order ${order.orderNumber} as CANCELLED`);
      } else if (topic === "ORDERS_UPDATED" && payload.financial_status === "refunded" && order.status !== "REFUNDED") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
          },
        });
        console.log(`[Order Webhook] Marked order ${order.orderNumber} as REFUNDED`);
      }
      return { success: true };
    }

    // If order not found by shopifyOrderId, this might be a new order from a draft
    // Try to find by draft order ID pattern in note_attributes or source
    // Shopify doesn't directly give us the draft order ID in order webhook, so we need
    // to query orders that are PENDING and match by name/timing

    // For now, log and return success - manual linking may be needed
    // A better approach would be to use the draftOrderComplete response to link immediately
    console.log(`[Order Webhook] Order ${payload.name} not linked to local order`);

    return { success: true };
  } catch (error) {
    console.error("[Order Webhook] Error processing:", error);
    return { success: false, error: "Failed to process order webhook" };
  }
}

// Process DRAFT_ORDERS_UPDATE webhook
// When a draft order is completed (status changes to "completed"), it has an order_id
export async function processDraftOrderWebhook(
  shopDomain: string,
  topic: string,
  payload: DraftOrderWebhookPayload
): Promise<{ success: true } | { success: false; error: string }> {
  console.log(`[Draft Order Webhook] Processing ${topic} for draft ${payload.name}, status: ${payload.status}`);

  try {
    // Find shop with billing info
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      select: {
        id: true,
        billingPlan: true,
        billingStatus: true,
      },
    });

    if (!shop) {
      console.log(`[Draft Order Webhook] Shop not found: ${shopDomain}`);
      return { success: false, error: "Shop not found" };
    }

    // Extract numeric ID from GID for storage/lookup
    const shopifyDraftOrderId = fromGid(payload.admin_graphql_api_id);

    // Find local order by draft order ID
    const order = await prisma.order.findFirst({
      where: { shopId: shop.id, shopifyDraftOrderId },
    });

    if (!order) {
      console.log(`[Draft Order Webhook] No local order found for draft ${payload.name}`);
      return { success: true };
    }

    // Check if draft order was completed (converted to real order)
    if (payload.status === "completed" && payload.order_id) {
      // Store numeric ID only (not full GID)
      const shopifyOrderId = String(payload.order_id);

      await prisma.order.update({
        where: { id: order.id },
        data: {
          shopifyOrderId,
          shopifyOrderNumber: payload.name?.replace("D", "") || null, // Draft #D1 -> Order #1
          status: "PAID", // Assuming payment was collected
          placedAt: new Date(),
          paidAt: new Date(),
        },
      });

      console.log(`[Draft Order Webhook] Linked order ${order.orderNumber} to Shopify order ${shopifyOrderId}`);

      // Record for billing revenue share
      if (shop.billingPlan && (shop.billingStatus === "ACTIVE" || shop.billingStatus === "TRIAL")) {
        const billingPeriod = await getCurrentBillingPeriod(shop.id);
        if (billingPeriod) {
          const planConfig = PLAN_CONFIGS[shop.billingPlan];
          await recordBilledOrder(order.id, billingPeriod.id, planConfig.revenueSharePercent);
          console.log(`[Draft Order Webhook] Recorded billed order for revenue share`);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[Draft Order Webhook] Error processing:", error);
    return { success: false, error: "Failed to process draft order webhook" };
  }
}

// Mark order as refunded
export async function markOrderRefunded(
  shopId: string,
  orderId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId },
  });

  if (!order) {
    return { success: false, error: "Order not found" };
  }

  if (order.status === "DRAFT" || order.status === "CANCELLED") {
    return { success: false, error: "Cannot refund draft or cancelled orders" };
  }

  if (order.status === "REFUNDED") {
    return { success: true }; // Already refunded
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error marking order as refunded:", error);
    return { success: false, error: "Failed to mark order as refunded" };
  }
}
