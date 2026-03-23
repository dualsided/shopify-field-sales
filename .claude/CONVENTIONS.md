# Code Conventions

## File Naming
- Components: PascalCase (CompanyList.tsx)
- Utilities: camelCase (getShopifyClient.ts)
- API routes: route.ts in folder structure (app/api/companies/route.ts)
- Types: PascalCase, suffix with type (CompanyResponse, CartLineItem)

## Project Structure (Field App - Rep Portal)
```
apps/field-app/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (call services, never Prisma directly)
│   ├── (auth)/            # Auth route group
│   ├── (app)/             # Authenticated route group
│   │   ├── dashboard/
│   │   ├── accounts/
│   │   ├── orders/
│   │   └── settings/
│   ├── layout.tsx
│   └── middleware.ts      # Multi-tenant + auth resolution
├── components/
│   ├── ui/                # Reusable primitives (Button, Card, etc.)
│   ├── accounts/          # Account-specific components
│   ├── cart/              # Cart-specific components
│   └── orders/            # Order-specific components
├── lib/
│   ├── shopify/           # Shopify GraphQL client + queries
│   │   ├── client.ts      # Tenant-scoped GraphQL client
│   │   ├── queries/       # Read operations
│   │   └── mutations/     # Write operations
│   ├── auth/              # Session management
│   ├── db/                # Prisma client + helpers
│   ├── redis/             # Redis client + cache helpers
│   └── utils/             # General utilities
├── services/              # Business logic layer
│   ├── territory.ts
│   ├── company.ts
│   ├── cart.ts
│   ├── order.ts
│   └── product.ts
└── types/                 # TypeScript type definitions
```

## Project Structure (Shopify App)
```
apps/shopify-app/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx     # Main config dashboard
│   │   ├── app.settings.tsx   # Payment strategy config
│   │   ├── auth.$.tsx         # OAuth flow
│   │   ├── auth.login/        # Login page
│   │   └── webhooks.*.tsx     # Webhook handlers
│   ├── shopify.server.ts      # Shopify app configuration
│   └── db.server.ts           # Database client
├── prisma/
│   └── schema.prisma          # Session + tenant storage
└── extensions/                # Future Shopify extensions
```

## Patterns

### Service Layer
- All business logic lives in `services/`
- API routes call services, services call Shopify/DB
- Never call Prisma directly from API routes
- Services throw typed errors, API routes catch and format

```typescript
// services/company.ts
export async function getCompaniesForRep(tenantId: string, repId: string) {
  const rep = await prisma.salesRep.findUnique({ ... });
  const territories = await prisma.territory.findMany({ ... });
  // ... business logic
  return companies;
}

// app/api/companies/route.ts
export async function GET(request: Request) {
  try {
    const companies = await getCompaniesForRep(tenantId, repId);
    return NextResponse.json(companies);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ...
  }
}
```

### Shopify GraphQL
- All queries in `lib/shopify/queries/`
- All mutations in `lib/shopify/mutations/`
- Use tenant-scoped client that injects access token

```typescript
// lib/shopify/queries/companies.ts
export const GET_COMPANY = `#graphql
  query GetCompany($id: ID!) {
    company(id: $id) {
      id
      name
      locations(first: 10) {
        edges {
          node {
            id
            address { ... }
          }
        }
      }
    }
  }
`;

// lib/shopify/client.ts
export function createShopifyClient(tenant: Tenant) {
  return {
    query: async (query: string, variables?: Record<string, unknown>) => {
      // Uses tenant.accessToken
    }
  };
}
```

### Error Handling
```typescript
// types/errors.ts
export class AppError extends Error {
  constructor(message: string, public code: string, public statusCode: number) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}
```

## Environment Variables

### Field App
```
DATABASE_URL=              # PostgreSQL connection string
REDIS_URL=                 # Redis connection string
JWT_SECRET=                # JWT signing secret
NEXT_PUBLIC_APP_URL=       # Public app URL
TWILIO_ACCOUNT_SID=        # Twilio account SID
TWILIO_AUTH_TOKEN=         # Twilio auth token
TWILIO_VERIFY_SID=         # Twilio Verify service SID
```

### Shopify App
```
SHOPIFY_API_KEY=           # Shopify app API key
SHOPIFY_API_SECRET=        # Shopify app secret
SCOPES=                    # Comma-separated OAuth scopes
SHOPIFY_APP_URL=           # Shopify app URL
```

### Shared (for payment processing)
```
STRIPE_SECRET_KEY=         # Stripe secret key
STRIPE_WEBHOOK_SECRET=     # Stripe webhook secret
```

## Mobile-First UI Principles
- Bottom navigation bar: Dashboard, Accounts, Orders, More
- Cart builder: sticky bottom sheet with running total
- Large touch targets (48px minimum)
- Pull-to-refresh everywhere
- Tailwind mobile-first breakpoints (sm → md → lg)

```tsx
// Example mobile-first component
<div className="p-4 md:p-6 lg:p-8">
  <button className="min-h-[48px] w-full md:w-auto">
    Touch Target
  </button>
</div>
```

## Git Conventions
- Branch naming: `feature/`, `fix/`, `chore/`
- Commit messages: imperative mood, reference issue if applicable
- PR titles: describe the change concisely
