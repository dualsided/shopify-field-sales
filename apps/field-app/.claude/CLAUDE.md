# Field App - Claude Context

## What This App Does
Mobile-first web application for field sales representatives. Sales reps use this to:
- View and manage assigned accounts (companies)
- Browse product catalog
- Build carts and place orders
- Track order history

## Architecture

### Framework
- Next.js 16 with App Router and Server Components
- TypeScript in strict mode
- Tailwind CSS for styling (mobile-first)
- Prisma ORM with PostgreSQL

### Authentication
- JWT-based auth with refresh tokens
- Sessions stored in Redis
- Multi-tenant by `shopId` (each Shopify store is a tenant)
- Role-based access: REP, MANAGER, ADMIN

### Key Directories
```
src/
├── app/                 # Next.js App Router pages
│   ├── (app)/          # Authenticated routes (wrapped in layout)
│   ├── api/            # API route handlers
│   └── login/          # Public login page
├── components/         # React components
├── lib/               # Utilities (auth, db, redis, shopify client)
├── services/          # Business logic (product-sync, promotion-engine)
└── types/             # TypeScript type definitions
```

### Database
- Shared PostgreSQL database with shopify-app
- Custom Prisma client output: `./node_modules/.prisma/field-app-client`
- Import Prisma types from `.prisma/field-app-client`

### Key Models
- `Shop` - Tenant (Shopify store)
- `SalesRep` - App users with `shopId`, `role`, territories
- `Company` - B2B customers synced from Shopify
- `Product/ProductVariant` - Products synced from Shopify
- `CartSession` - Active shopping carts
- `Order/OrderLineItem` - Orders placed through the app
- `Promotion` - App-managed discounts

## Code Patterns

### API Routes
```typescript
export async function GET(request: Request) {
  const { shopId, repId, role } = await getAuthContext();

  // Always filter by shopId
  const data = await prisma.company.findMany({
    where: { shopId },
  });

  return NextResponse.json({ data, error: null });
}
```

### Auth Context
```typescript
import { getAuthContext } from '@/lib/auth';

const { shopId, repId, role } = await getAuthContext();
// role is 'REP' | 'MANAGER' | 'ADMIN'
```

### Shopify GraphQL
```typescript
import { shopifyGraphQL } from '@/lib/shopify/client';

const data = await shopifyGraphQL<ResponseType>(shopId, QUERY, variables);
```

### Error Response Pattern
```typescript
return NextResponse.json<ApiError>(
  { data: null, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  { status: 404 }
);
```

## Important Conventions

### Money
- Store prices in cents as integers (`totalCents`, `priceCents`)
- Convert to dollars only for display

### IDs
- Internal IDs are CUIDs (e.g., `clxyz123...`)
- Shopify IDs are GIDs (e.g., `gid://shopify/Product/123`)
- Store both when relevant (`id` and `shopifyProductId`)

### Multi-Tenancy
- Every query MUST include `shopId` filter
- Never expose data across tenants
- Rep can only see companies in their territory

### Products
- Products must have `enabledForFieldApp: true` to show in field app
- Auto-enabled via inclusion tag matching
- Synced from Shopify via webhooks

## Testing Locally

### Dev Login
Visit `/login` to select a sales rep without password (dev mode only)

### Database
```bash
npm run db:push      # Push schema changes
npm run db:seed      # Seed sample data
npm run db:generate  # Regenerate Prisma client
```

### Run Server
```bash
npm run dev          # Starts on port 3001
```

## Common Tasks

### Add API Endpoint
1. Create route in `src/app/api/[resource]/route.ts`
2. Use `getAuthContext()` for authentication
3. Filter by `shopId` in all queries
4. Return `{ data, error }` format

### Add Page
1. Create in `src/app/(app)/[page]/page.tsx`
2. Use Server Components for data fetching
3. Add loading.tsx and error.tsx as needed

### Update Schema
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push`
3. Run `npx prisma generate`
4. Update shopify-app schema to match (shared database)
