# Database Schema & Key Queries

## PostgreSQL Schema (Prisma)

### Full Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// TENANT & AUTHENTICATION
// ============================================

model Tenant {
  id              String    @id @default(cuid())
  shopifyDomain   String    @unique
  shopName        String
  accessToken     String    // Encrypted Shopify offline access token
  scopes          String
  paymentStrategy PaymentStrategy @default(SHOPIFY_TERMS)
  stripeAccountId String?   // For Stripe Connect (if using Stripe)
  config          Json?     // Additional tenant configuration
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  salesReps       SalesRep[]
  territories     Territory[]
  companySyncs    CompanySync[]
  paymentMethods  PaymentMethodMap[]
  cartSessions    CartSession[]
  orderRefs       OrderRef[]
}

enum PaymentStrategy {
  SHOPIFY_TERMS   // Net 30/60, Shopify sends invoice
  STRIPE_VAULT    // Card vaulted in Stripe, charge on order
  SHOPIFY_VAULT   // Future: Shopify native vaulting
}

model SalesRep {
  id           String    @id @default(cuid())
  tenantId     String
  email        String
  firstName    String
  lastName     String
  phone        String?
  role         RepRole   @default(REP)
  passwordHash String
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  // Relations
  tenant            Tenant             @relation(fields: [tenantId], references: [id])
  repTerritories    RepTerritory[]
  assignedCompanies CompanySync[]
  cartSessions      CartSession[]
  orderRefs         OrderRef[]

  @@unique([tenantId, email])
  @@index([tenantId])
}

enum RepRole {
  REP
  MANAGER
  ADMIN
}

// ============================================
// TERRITORIES
// ============================================

model Territory {
  id          String    @id @default(cuid())
  tenantId    String
  name        String
  description String?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  tenant        Tenant             @relation(fields: [tenantId], references: [id])
  zipcodes      TerritoryZipcode[]
  repTerritories RepTerritory[]
  companies     CompanySync[]
  orderRefs     OrderRef[]

  @@index([tenantId])
}

model TerritoryZipcode {
  id          String    @id @default(cuid())
  territoryId String
  zipcode     String

  // Relations
  territory   Territory @relation(fields: [territoryId], references: [id], onDelete: Cascade)

  @@unique([territoryId, zipcode])
  @@index([zipcode])
}

model RepTerritory {
  id          String    @id @default(cuid())
  repId       String
  territoryId String
  isPrimary   Boolean   @default(false)
  createdAt   DateTime  @default(now())

  // Relations
  rep       SalesRep  @relation(fields: [repId], references: [id], onDelete: Cascade)
  territory Territory @relation(fields: [territoryId], references: [id], onDelete: Cascade)

  @@unique([repId, territoryId])
}

// ============================================
// COMPANY SYNC (from Shopify webhooks)
// ============================================

model CompanySync {
  id                String      @id @default(cuid())
  tenantId          String
  shopifyCompanyId  String      // Shopify GID
  shopifyLocationId String?     // Primary location GID
  companyName       String
  primaryZipcode    String?
  territoryId       String?     // Auto-assigned based on zipcode
  assignedRepId     String?     // Manual rep assignment
  syncStatus        SyncStatus  @default(SYNCED)
  lastSyncedAt      DateTime    @default(now())
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  // Relations
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  territory   Territory? @relation(fields: [territoryId], references: [id])
  assignedRep SalesRep?  @relation(fields: [assignedRepId], references: [id])

  @@unique([tenantId, shopifyCompanyId])
  @@index([territoryId])
  @@index([assignedRepId])
  @@index([primaryZipcode])
}

enum SyncStatus {
  SYNCED
  PENDING
  ERROR
}

// ============================================
// PAYMENTS
// ============================================

model PaymentMethodMap {
  id                 String    @id @default(cuid())
  tenantId           String
  shopifyCompanyId   String    // Links to Shopify Company
  provider           PaymentProvider
  externalCustomerId String?   // Stripe customer ID, etc.
  externalMethodId   String    // Stripe payment method ID, etc.
  last4              String?
  brand              String?   // visa, mastercard, etc.
  expiryMonth        Int?
  expiryYear         Int?
  isDefault          Boolean   @default(false)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, shopifyCompanyId, externalMethodId])
  @@index([tenantId, shopifyCompanyId])
}

enum PaymentProvider {
  STRIPE
  SHOPIFY_TERMS
  SHOPIFY_VAULT
}

// ============================================
// CART & ORDERS
// ============================================

model CartSession {
  id                String      @id @default(cuid())
  tenantId          String
  repId             String
  shopifyCompanyId  String
  shopifyLocationId String?
  lineItems         Json        // Array of { variantId, quantity, price }
  discountCodes     String[]
  notes             String?
  status            CartStatus  @default(ACTIVE)
  expiresAt         DateTime
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  // Relations
  tenant Tenant   @relation(fields: [tenantId], references: [id])
  rep    SalesRep @relation(fields: [repId], references: [id])

  @@index([tenantId, repId])
  @@index([tenantId, shopifyCompanyId])
}

enum CartStatus {
  ACTIVE
  SUBMITTED
  ABANDONED
}

model OrderRef {
  id                   String    @id @default(cuid())
  tenantId             String
  repId                String
  shopifyOrderId       String    // Shopify Order GID
  shopifyOrderNumber   String    // Human-readable order number
  shopifyCompanyId     String
  territoryId          String?
  paymentProvider      PaymentProvider?
  paymentTransactionId String?   // Stripe charge ID, etc.
  orderTotal           Decimal   @db.Decimal(10, 2)
  currency             String    @default("USD")
  status               String    // Mirrors Shopify order status
  placedAt             DateTime
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  // Relations
  tenant    Tenant     @relation(fields: [tenantId], references: [id])
  rep       SalesRep   @relation(fields: [repId], references: [id])
  territory Territory? @relation(fields: [territoryId], references: [id])

  @@unique([tenantId, shopifyOrderId])
  @@index([repId, placedAt(sort: Desc)])
  @@index([shopifyCompanyId, placedAt(sort: Desc)])
}

// ============================================
// SHOPIFY SESSION (for embedded app)
// ============================================

model Session {
  id                  String    @id
  shop                String
  state               String
  isOnline            Boolean   @default(false)
  scope               String?
  expires             DateTime?
  accessToken         String
  userId              BigInt?
  firstName           String?
  lastName            String?
  email               String?
  accountOwner        Boolean   @default(false)
  locale              String?
  collaborator        Boolean?  @default(false)
  emailVerified       Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}
```

## Key Shopify GraphQL Queries

### Get Company with Locations

```graphql
query GetCompany($id: ID!) {
  company(id: $id) {
    id
    name
    note
    externalId
    mainContact {
      id
      customer {
        id
        email
        firstName
        lastName
        phone
      }
    }
    locations(first: 10) {
      edges {
        node {
          id
          name
          shippingAddress {
            address1
            address2
            city
            provinceCode
            zip
            countryCode
          }
          billingAddress {
            address1
            address2
            city
            provinceCode
            zip
            countryCode
          }
        }
      }
    }
    orders(first: 10, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}
```

### List Companies for Territory

```graphql
query ListCompanies($first: Int!, $after: String, $query: String) {
  companies(first: $first, after: $after, query: $query) {
    edges {
      node {
        id
        name
        mainContact {
          customer {
            email
          }
        }
        locations(first: 1) {
          edges {
            node {
              shippingAddress {
                zip
                city
                provinceCode
              }
            }
          }
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Get Products with Pricing

```graphql
query GetProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: TITLE) {
    edges {
      node {
        id
        title
        handle
        description
        featuredImage {
          url
          altText
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Get B2B Catalog Pricing (if using B2B Catalogs)

```graphql
query GetCompanyPricing($companyLocationId: ID!, $productIds: [ID!]!) {
  companyLocation(id: $companyLocationId) {
    catalog {
      id
      priceList {
        prices(first: 100, productIds: $productIds) {
          edges {
            node {
              variant {
                id
              }
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
}
```

## Key Shopify GraphQL Mutations

### Create Draft Order

```graphql
mutation CreateDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      name
      invoiceUrl
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}

# Variables:
{
  "input": {
    "purchasingEntity": {
      "purchasingCompany": {
        "companyId": "gid://shopify/Company/123",
        "companyLocationId": "gid://shopify/CompanyLocation/456"
      }
    },
    "lineItems": [
      {
        "variantId": "gid://shopify/ProductVariant/789",
        "quantity": 2
      }
    ],
    "note": "Placed by field rep",
    "tags": ["field-sales"],
    "paymentTerms": {
      "paymentTermsTemplateId": "gid://shopify/PaymentTermsTemplate/1"
    }
  }
}
```

### Complete Draft Order

```graphql
mutation CompleteDraftOrder($id: ID!) {
  draftOrderComplete(id: $id) {
    draftOrder {
      id
      order {
        id
        name
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Mark Order as Paid (for Stripe payments)

```graphql
mutation MarkOrderAsPaid($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) {
    order {
      id
      displayFinancialStatus
    }
    userErrors {
      field
      message
    }
  }
}

# Variables:
{
  "input": {
    "id": "gid://shopify/Order/123",
    "amount": {
      "amount": "100.00",
      "currencyCode": "USD"
    }
  }
}
```

### Register Webhooks

```graphql
mutation RegisterWebhooks($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: $webhookSubscription
  ) {
    webhookSubscription {
      id
      topic
      endpoint {
        ... on WebhookHttpEndpoint {
          callbackUrl
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}

# Topics to register:
# - COMPANIES_CREATE
# - COMPANIES_UPDATE
# - COMPANIES_DELETE
# - ORDERS_UPDATED
# - PRODUCTS_UPDATE
# - APP_UNINSTALLED
```

## Common Service Queries

### Get Companies for Rep (Prisma)

```typescript
async function getCompaniesForRep(tenantId: string, repId: string) {
  // Get rep's territories
  const repTerritories = await prisma.repTerritory.findMany({
    where: { repId },
    include: {
      territory: {
        include: {
          zipcodes: true
        }
      }
    }
  });

  // Extract all zipcodes
  const zipcodes = repTerritories.flatMap(
    rt => rt.territory.zipcodes.map(tz => tz.zipcode)
  );

  // Get companies in those zipcodes
  const companies = await prisma.companySync.findMany({
    where: {
      tenantId,
      OR: [
        { primaryZipcode: { in: zipcodes } },
        { assignedRepId: repId }  // Also include manually assigned
      ]
    },
    orderBy: { companyName: 'asc' }
  });

  return companies;
}
```

### Get Rep Dashboard Stats (Prisma)

```typescript
async function getRepDashboard(tenantId: string, repId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [orderStats, recentOrders, companyCount] = await Promise.all([
    // Order stats for last 30 days
    prisma.orderRef.aggregate({
      where: {
        tenantId,
        repId,
        placedAt: { gte: thirtyDaysAgo }
      },
      _count: true,
      _sum: { orderTotal: true }
    }),

    // Recent orders
    prisma.orderRef.findMany({
      where: { tenantId, repId },
      orderBy: { placedAt: 'desc' },
      take: 5
    }),

    // Company count in territory
    getCompaniesForRep(tenantId, repId).then(c => c.length)
  ]);

  return {
    ordersThisMonth: orderStats._count,
    revenueThisMonth: orderStats._sum.orderTotal || 0,
    recentOrders,
    companyCount
  };
}
```
