import { authenticate } from "../shopify.server";
import { prisma } from "@field-sales/database";
import type { Shop } from "@prisma/client";
import { getShopifyCompaniesCount } from "./company.server";

export interface AuthenticatedShop {
  shop: Shop;
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
  redirect: Awaited<ReturnType<typeof authenticate.admin>>["redirect"];
}

/**
 * Authenticates the request and returns the shop record.
 * Use this in loaders and actions to get the authenticated shop.
 */
export async function getAuthenticatedShop(
  request: Request
): Promise<AuthenticatedShop> {
  const { session, admin, redirect } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  return { shop, session, admin, redirect };
}

/**
 * Gets the shop if it exists, returns null otherwise.
 * Use this when you want to handle missing shop gracefully.
 */
export async function getShopOrNull(
  request: Request
): Promise<{
  shop: Shop | null;
  session: Awaited<ReturnType<typeof authenticate.admin>>["session"];
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
}> {
  const { session, admin } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  return { shop, session, admin };
}

export interface TopSalesRep {
  id: string;
  name: string;
  revenueCents: number;
  orderCount: number;
}

export interface TopCompany {
  id: string;
  name: string;
  revenueCents: number;
  orderCount: number;
}

export interface DashboardData {
  shopName: string;
  companiesCount: number;
  hasManagedCompanies: boolean;
  shop: {
    id: string;
    isActive: boolean;
  } | null;
  topSalesReps: TopSalesRep[];
  topCompanies: TopCompany[];
}

/**
 * Get all data needed for the dashboard.
 */
export async function getDashboardData(request: Request): Promise<DashboardData> {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  // Get shop info from database
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
    select: {
      id: true,
      isActive: true,
      hasManagedCompanies: true,
    },
  });

  // Get companies count from Shopify
  const companiesCount = await getShopifyCompaniesCount(admin);

  // Fetch leaderboards if we have a shop and date range
  let topSalesReps: TopSalesRep[] = [];
  let topCompanies: TopCompany[] = [];

  if (shop?.id && startDate && endDate) {
    const dateFilter = {
      placedAt: {
        gte: new Date(startDate),
        lte: new Date(endDate + "T23:59:59.999Z"),
      },
    };

    // Top 10 Sales Reps by Revenue (exclude DRAFT and CANCELLED orders)
    const salesRepStats = await prisma.order.groupBy({
      by: ["salesRepId"],
      where: {
        shopId: shop.id,
        status: { in: ["AWAITING_REVIEW", "PENDING", "PAID"] },
        ...dateFilter,
      },
      _sum: { totalCents: true },
      _count: { _all: true },
      orderBy: { _sum: { totalCents: "desc" } },
      take: 10,
    });

    // Get sales rep names
    const repIds = salesRepStats.map((s) => s.salesRepId);
    const reps = await prisma.salesRep.findMany({
      where: { id: { in: repIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const repMap = new Map(reps.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));

    topSalesReps = salesRepStats.map((s) => ({
      id: s.salesRepId,
      name: repMap.get(s.salesRepId) || "Unknown",
      revenueCents: s._sum?.totalCents || 0,
      orderCount: s._count?._all || 0,
    }));

    // Top 10 Companies by Revenue (exclude DRAFT and CANCELLED orders)
    const companyStats = await prisma.order.groupBy({
      by: ["companyId"],
      where: {
        shopId: shop.id,
        status: { in: ["AWAITING_REVIEW", "PENDING", "PAID"] },
        ...dateFilter,
      },
      _sum: { totalCents: true },
      _count: { _all: true },
      orderBy: { _sum: { totalCents: "desc" } },
      take: 10,
    });

    // Get company names
    const companyIds = companyStats.map((c) => c.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));

    topCompanies = companyStats.map((c) => ({
      id: c.companyId,
      name: companyMap.get(c.companyId) || "Unknown",
      revenueCents: c._sum?.totalCents || 0,
      orderCount: c._count?._all || 0,
    }));
  }

  return {
    shopName: session.shop.replace(".myshopify.com", ""),
    companiesCount,
    hasManagedCompanies: shop?.hasManagedCompanies || false,
    shop: shop ? { id: shop.id, isActive: shop.isActive } : null,
    topSalesReps,
    topCompanies,
  };
}
