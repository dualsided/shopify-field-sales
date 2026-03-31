# Field App - Claude Context

Mobile-first web app for field sales representatives.

> **Detailed documentation:** See `/docs` directory for in-depth guides on [Orders](../docs/orders.md), [Accounts](../docs/accounts.md), [Products](../docs/products.md), [Promotions](../docs/promotions.md), [Cart](../docs/cart.md), and [Auth](../docs/auth.md).

## Architecture

### Stack
- Next.js 16 with App Router
- TypeScript (strict mode)
- Tailwind CSS (mobile-first)
- Prisma ORM with PostgreSQL

### Key Directories
```
src/
├── app/
│   ├── (app)/          # Authenticated routes
│   ├── api/            # API route handlers
│   └── login/          # Public login page
├── components/         # React components
├── lib/                # Utilities (auth, db, redis)
├── services/           # Business logic
└── types/              # TypeScript definitions
```

### Data Flow
- **This app does NOT interact with Shopify directly**
- Reads/writes to shared PostgreSQL database
- shopify-app handles all Shopify API communication

## Code Patterns

### API Routes
```typescript
export async function GET(request: Request) {
  const { shopId, repId, role } = await getAuthContext();

  const data = await prisma.company.findMany({
    where: { shopId },  // Always filter by shopId
  });

  return NextResponse.json({ data, error: null });
}
```

### Error Response
```typescript
return NextResponse.json<ApiError>(
  { data: null, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
  { status: 404 }
);
```

## Important Conventions

### Money
- Store in cents as integers (`totalCents`, `priceCents`)
- Convert to dollars only for display

### IDs
- Internal: CUIDs (`clxyz123...`)
- Shopify: GIDs (`gid://shopify/Product/123`)

### Multi-Tenancy
- Every query MUST include `shopId` filter
- Never expose data across tenants

### Database
- Shared with shopify-app
- Custom Prisma client: `./node_modules/.prisma/field-app-client`
- Import types from `.prisma/field-app-client`

## Quick Commands

```bash
npm run dev           # Start dev server (port 3001)
npm run db:push       # Push schema changes
npm run db:generate   # Regenerate Prisma client
npm run db:seed       # Seed sample data
```

## Common Tasks

### Add API Endpoint
1. Create `src/app/api/[resource]/route.ts`
2. Use `getAuthContext()` for auth
3. Filter by `shopId` in all queries
4. Return `{ data, error }` format

### Update Schema
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push && npx prisma generate`
3. Update shopify-app schema to match
