import { prisma } from '@/lib/db/prisma';
import { shopifyGraphQL } from '@/lib/shopify/client';

// GraphQL mutations for customer management
const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation CustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
        firstName
        lastName
        phone
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CUSTOMER_UPDATE_MUTATION = `#graphql
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        email
        firstName
        lastName
        phone
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CUSTOMER_LOOKUP_QUERY = `#graphql
  query CustomerLookup($email: String!) {
    customers(first: 1, query: $email) {
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
        }
      }
    }
  }
`;

interface ShopifyCustomer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

interface CustomerCreateResponse {
  customerCreate: {
    customer: ShopifyCustomer | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

interface CustomerUpdateResponse {
  customerUpdate: {
    customer: ShopifyCustomer | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

interface CustomerLookupResponse {
  customers: {
    edges: Array<{ node: ShopifyCustomer }>;
  };
}

/**
 * Sync a company contact to Shopify as a Customer.
 * Creates a new customer or updates an existing one.
 * Returns the Shopify Customer GID.
 */
export async function syncContactToShopifyCustomer(
  shopId: string,
  contactId: string
): Promise<string | null> {
  const contact = await prisma.companyContact.findUnique({
    where: { id: contactId },
    include: {
      company: {
        select: { shopId: true },
      },
    },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  if (contact.company.shopId !== shopId) {
    throw new Error('Contact does not belong to this shop');
  }

  // If already synced, update the existing customer
  if (contact.shopifyCustomerId) {
    return updateShopifyCustomer(shopId, contact);
  }

  // Check if a customer with this email already exists
  const existingCustomer = await findCustomerByEmail(shopId, contact.email);

  if (existingCustomer) {
    // Link to existing customer and update
    await prisma.companyContact.update({
      where: { id: contactId },
      data: { shopifyCustomerId: existingCustomer.id },
    });
    return updateShopifyCustomer(shopId, { ...contact, shopifyCustomerId: existingCustomer.id });
  }

  // Create new customer
  return createShopifyCustomer(shopId, contact);
}

/**
 * Create a new Shopify Customer from a contact
 */
async function createShopifyCustomer(
  shopId: string,
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  }
): Promise<string | null> {
  try {
    const response = await shopifyGraphQL<CustomerCreateResponse>(
      shopId,
      CUSTOMER_CREATE_MUTATION,
      {
        input: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
        },
      }
    );

    if (response.customerCreate.userErrors.length > 0) {
      const error = response.customerCreate.userErrors[0];
      console.error(`Failed to create Shopify customer: ${error.message}`);

      // If email already exists, try to find and link
      if (error.message.toLowerCase().includes('email') && error.message.toLowerCase().includes('taken')) {
        const existing = await findCustomerByEmail(shopId, contact.email);
        if (existing) {
          await prisma.companyContact.update({
            where: { id: contact.id },
            data: { shopifyCustomerId: existing.id },
          });
          return existing.id;
        }
      }
      return null;
    }

    const customer = response.customerCreate.customer;
    if (!customer) {
      return null;
    }

    // Update contact with Shopify Customer ID
    await prisma.companyContact.update({
      where: { id: contact.id },
      data: { shopifyCustomerId: customer.id },
    });

    console.log(`Created Shopify customer ${customer.id} for contact ${contact.id}`);
    return customer.id;
  } catch (error) {
    console.error('Error creating Shopify customer:', error);
    return null;
  }
}

/**
 * Update an existing Shopify Customer from a contact
 */
async function updateShopifyCustomer(
  shopId: string,
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    shopifyCustomerId: string | null;
  }
): Promise<string | null> {
  if (!contact.shopifyCustomerId) {
    return null;
  }

  try {
    const response = await shopifyGraphQL<CustomerUpdateResponse>(
      shopId,
      CUSTOMER_UPDATE_MUTATION,
      {
        input: {
          id: contact.shopifyCustomerId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
        },
      }
    );

    if (response.customerUpdate.userErrors.length > 0) {
      console.error(`Failed to update Shopify customer: ${response.customerUpdate.userErrors[0].message}`);
      return contact.shopifyCustomerId; // Return existing ID even if update failed
    }

    console.log(`Updated Shopify customer ${contact.shopifyCustomerId} for contact ${contact.id}`);
    return contact.shopifyCustomerId;
  } catch (error) {
    console.error('Error updating Shopify customer:', error);
    return contact.shopifyCustomerId; // Return existing ID even if update failed
  }
}

/**
 * Find a Shopify Customer by email
 */
async function findCustomerByEmail(
  shopId: string,
  email: string
): Promise<ShopifyCustomer | null> {
  try {
    const response = await shopifyGraphQL<CustomerLookupResponse>(
      shopId,
      CUSTOMER_LOOKUP_QUERY,
      { email: `email:${email}` }
    );

    const edges = response.customers.edges;
    if (edges.length === 0) {
      return null;
    }

    return edges[0].node;
  } catch (error) {
    console.error('Error looking up Shopify customer:', error);
    return null;
  }
}

/**
 * Sync all contacts for a company to Shopify
 */
export async function syncCompanyContactsToShopify(
  shopId: string,
  companyId: string
): Promise<{ synced: number; failed: number }> {
  const contacts = await prisma.companyContact.findMany({
    where: { companyId },
  });

  let synced = 0;
  let failed = 0;

  for (const contact of contacts) {
    const result = await syncContactToShopifyCustomer(shopId, contact.id);
    if (result) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Batch sync all unsynced contacts for a shop
 */
export async function syncUnsyncedContacts(
  shopId: string,
  limit: number = 50
): Promise<{ synced: number; failed: number }> {
  const contacts = await prisma.companyContact.findMany({
    where: {
      shopifyCustomerId: null,
      company: {
        shopId,
        isActive: true,
      },
    },
    take: limit,
  });

  let synced = 0;
  let failed = 0;

  for (const contact of contacts) {
    const result = await syncContactToShopifyCustomer(shopId, contact.id);
    if (result) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}
