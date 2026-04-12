import type { LoaderFunctionArgs } from "react-router";
import { prisma } from "@field-sales/database";
import { getAuthenticatedShop } from "../services/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { shop } = await getAuthenticatedShop(request);

    // Get all contacts for all active companies in this shop, including payment methods
    const contacts = await prisma.companyContact.findMany({
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
        paymentMethods: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            provider: true,
            last4: true,
            brand: true,
            expiryMonth: true,
            expiryYear: true,
            isDefault: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    });

    return Response.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        companyId: c.company.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        title: c.title,
        isPrimary: c.isPrimary,
        paymentMethods: c.paymentMethods,
      })),
    });
  } catch (error) {
    console.error("Error loading contacts:", error);
    return Response.json({ contacts: [] });
  }
};
