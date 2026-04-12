import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "@field-sales/database";
import { getAuthenticatedShop } from "../services/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);

    // Get all locations for all active companies in this shop
    const locations = await prisma.companyLocation.findMany({
      where: {
        company: {
          shopId: shop.id,
          isActive: true,
        },
      },
      include: {
        company: {
          select: { id: true },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });

    return Response.json({
      locations: locations.map((l) => ({
        id: l.id,
        companyId: l.company.id,
        name: l.name,
        address1: l.address1,
        address2: l.address2,
        city: l.city,
        province: l.province,
        provinceCode: l.provinceCode,
        zipcode: l.zipcode,
        country: l.country,
        phone: l.phone,
        isPrimary: l.isPrimary,
        isShippingAddress: l.isShippingAddress,
        isBillingAddress: l.isBillingAddress,
        // Payment terms from Shopify B2B
        paymentTermsType: l.paymentTermsType,
        paymentTermsDays: l.paymentTermsDays,
        checkoutToDraft: l.checkoutToDraft,
      })),
    });
  } catch (error) {
    console.error("Error loading locations:", error);
    return Response.json({ locations: [] });
  }
};
