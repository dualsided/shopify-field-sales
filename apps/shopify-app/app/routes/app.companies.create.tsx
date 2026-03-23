import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useActionData, Form } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { alignLocationToTerritory } from "../services/company.server";

interface SalesRep {
  id: string;
  name: string;
}

interface LoaderData {
  shopId: string | null;
  reps: SalesRep[];
  hasManagedCompanies: boolean;
}

interface ActionData {
  success?: boolean;
  companyId?: string;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { shopId: null, reps: [], hasManagedCompanies: false };
  }

  if (shop.hasManagedCompanies) {
    return { shopId: shop.id, reps: [], hasManagedCompanies: true };
  }

  const reps = await prisma.salesRep.findMany({
    where: { shopId: shop.id, isActive: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return {
    shopId: shop.id,
    reps: reps.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` })),
    hasManagedCompanies: false,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop || shop.hasManagedCompanies) {
    return { error: "Cannot create companies for this store" };
  }

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const accountNumber = formData.get("accountNumber") as string | null;
  const paymentTerms = formData.get("paymentTerms") as string;
  const assignedRepId = formData.get("assignedRepId") as string | null;

  // Contact info (optional first contact)
  const contactFirstName = formData.get("contactFirstName") as string | null;
  const contactLastName = formData.get("contactLastName") as string | null;
  const contactEmail = formData.get("contactEmail") as string | null;
  const contactPhone = formData.get("contactPhone") as string | null;

  // Location info (optional first location)
  const locationName = formData.get("locationName") as string | null;
  const address1 = formData.get("address1") as string | null;
  const city = formData.get("city") as string | null;
  const provinceCode = formData.get("provinceCode") as string | null;
  const zipcode = formData.get("zipcode") as string | null;

  if (!name?.trim()) {
    return { error: "Company name is required" };
  }

  // Check for duplicate name
  const existing = await prisma.company.findFirst({
    where: {
      shopId: shop.id,
      name: { equals: name.trim(), mode: "insensitive" },
    },
  });

  if (existing) {
    return { error: "A company with this name already exists" };
  }

  try {
    const company = await prisma.company.create({
      data: {
        shopId: shop.id,
        name: name.trim(),
        accountNumber: accountNumber?.trim() || null,
        paymentTerms: (paymentTerms as "DUE_ON_ORDER" | "NET_15" | "NET_30" | "NET_45" | "NET_60") || "DUE_ON_ORDER",
        assignedRepId: assignedRepId || null,
        syncStatus: "SYNCED",
        isActive: true,
        // Create initial location if provided
        ...(locationName?.trim() && {
          locations: {
            create: {
              name: locationName.trim(),
              isPrimary: true,
              address1: address1?.trim() || null,
              city: city?.trim() || null,
              provinceCode: provinceCode?.trim() || null,
              zipcode: zipcode?.trim() || null,
              country: "US",
              countryCode: "US",
            },
          },
        }),
        // Create initial contact if provided
        ...(contactFirstName?.trim() && contactLastName?.trim() && contactEmail?.trim() && {
          contacts: {
            create: {
              firstName: contactFirstName.trim(),
              lastName: contactLastName.trim(),
              email: contactEmail.trim().toLowerCase(),
              phone: contactPhone?.trim() || null,
              isPrimary: true,
              canPlaceOrders: true,
            },
          },
        }),
      },
      include: {
        locations: { select: { id: true } },
      },
    });

    // Align location to territory based on address
    if (company.locations.length > 0) {
      await alignLocationToTerritory(shop.id, company.locations[0].id);
    }

    return { success: true, companyId: company.id };
  } catch (error) {
    console.error("Error creating company:", error);
    return { error: "Failed to create company" };
  }
};

export default function NewCompanyPage() {
  const { shopId, reps, hasManagedCompanies } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const [showContact, setShowContact] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  // Redirect on success
  if (actionData?.success && actionData.companyId) {
    navigate(`/app/companies/${actionData.companyId}`);
    return null;
  }

  if (!shopId || hasManagedCompanies) {
    return (
      <s-page heading="Add Company">
        <s-section>
          <s-stack gap="base">
            <s-paragraph>
              Companies cannot be created in this app for your store.
            </s-paragraph>
            <s-button onClick={() => navigate("/app")}>Back to Dashboard</s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Add Company">
      <s-section>
        <Form method="post">
          <s-stack gap="base">
            {actionData?.error && (
              <s-banner tone="critical">{actionData.error}</s-banner>
            )}

            {/* Basic Info */}
            <s-heading>Company Information</s-heading>

            <s-text-field
              label="Company Name"
              name="name"
              required
            />

            <s-stack gap="none">
              <s-text-field
                label="Account Number"
                name="accountNumber"
              />
              <s-text color="subdued">Optional identifier for this company</s-text>
            </s-stack>

            <s-select label="Payment Terms" name="paymentTerms">
              <s-option value="DUE_ON_ORDER">Due on Order</s-option>
              <s-option value="NET_15">Net 15</s-option>
              <s-option value="NET_30">Net 30</s-option>
              <s-option value="NET_45">Net 45</s-option>
              <s-option value="NET_60">Net 60</s-option>
            </s-select>

            {reps.length > 0 && (
              <s-select label="Assigned Rep" name="assignedRepId">
                <s-option value="">No assigned rep</s-option>
                {reps.map((r) => (
                  <s-option key={r.id} value={r.id}>{r.name}</s-option>
                ))}
              </s-select>
            )}

            <s-divider />

            {/* Optional: First Location */}
            <s-stack gap="base">
              <s-checkbox
                label="Add initial location"
                checked={showLocation}
                onChange={() => setShowLocation(!showLocation)}
              />

              {showLocation && (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="base">
                    <s-heading>Location</s-heading>
                    <s-text-field label="Location Name" name="locationName" />
                    <s-text-field label="Address" name="address1" />
                    <s-text-field label="City" name="city" />
                    <s-text-field label="State/Province" name="provinceCode" />
                    <s-text-field label="ZIP Code" name="zipcode" />
                  </s-stack>
                </s-box>
              )}
            </s-stack>

            {/* Optional: First Contact */}
            <s-stack gap="base">
              <s-checkbox
                label="Add initial contact"
                checked={showContact}
                onChange={() => setShowContact(!showContact)}
              />

              {showContact && (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack gap="base">
                    <s-heading>Contact</s-heading>
                    <s-text-field label="First Name" name="contactFirstName" />
                    <s-text-field label="Last Name" name="contactLastName" />
                    <s-email-field label="Email" name="contactEmail" />
                    <s-text-field label="Phone" name="contactPhone" />
                  </s-stack>
                </s-box>
              )}
            </s-stack>

            <s-divider />

            <s-button-group>
              <s-button type="submit">Create Company</s-button>
              <s-button variant="secondary" onClick={() => navigate("/app/companies")}>
                Cancel
              </s-button>
            </s-button-group>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
