import { prisma } from '@/lib/db/prisma';

const SHOPIFY_API_VERSION = '2024-10';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyGraphQL<T>(
  shopId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopifyDomain: true, accessToken: true },
  });

  if (!shop) {
    throw new Error('Shop not found');
  }

  const response = await fetch(
    `https://${shop.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shop.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const json: GraphQLResponse<T> = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  if (!json.data) {
    throw new Error('No data returned from Shopify');
  }

  return json.data;
}
