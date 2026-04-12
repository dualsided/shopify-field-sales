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
- Uses shared `@field-sales/database` package
- Schema lives in `packages/database/prisma/schema.prisma`
- Import Prisma client and types from `@field-sales/database`

```typescript
import { prisma } from '@/lib/db/prisma';
import type { Company, Order } from '@field-sales/database';
```

## Quick Commands

```bash
npm run dev           # Start dev server (port 3001)
```

## Common Tasks

### Add API Endpoint
1. Create `src/app/api/[resource]/route.ts`
2. Use `getAuthContext()` for auth
3. Filter by `shopId` in all queries
4. Return `{ data, error }` format

## Database Management

**IMPORTANT:** Both apps share a single database schema. All schema changes are made in `packages/database/prisma/schema.prisma`.

### Schema Location
```
packages/database/
├── prisma/
│   ├── schema.prisma    # THE schema (edit this)
│   ├── migrations/      # Migration history
│   └── seed.ts          # Seed data
└── src/
    ├── client.ts        # Prisma client singleton
    └── index.ts         # Exports client + types
```

### Database Commands (run from monorepo root)
```bash
npm run db:push       # Push schema changes (dev - no migration)
npm run db:migrate    # Create migration (production)
npm run db:generate   # Regenerate Prisma client only
npm run db:seed       # Seed sample data
npm run db:studio     # Open Prisma Studio GUI
```

### How to Update the Schema

1. **Edit the schema:**
   ```bash
   # Edit packages/database/prisma/schema.prisma
   ```

2. **Push changes to database (development):**
   ```bash
   cd /path/to/shopify-field-sales
   npm run db:push
   ```

3. **Both apps automatically get the updated types** - the Prisma client is regenerated and shared via the `@field-sales/database` package.

### Adding a New Model

1. Add the model to `packages/database/prisma/schema.prisma`:
   ```prisma
   model NewModel {
     id        String   @id @default(cuid())
     shopId    String
     name      String
     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     shop Shop @relation(fields: [shopId], references: [id])

     @@index([shopId])
     @@map("new_models")
   }
   ```

2. Add the relation to Shop model if needed:
   ```prisma
   model Shop {
     // ... existing fields
     newModels NewModel[]
   }
   ```

3. Run `npm run db:push` from monorepo root

4. Import and use in either app:
   ```typescript
   import type { NewModel } from '@field-sales/database';
   ```

### Adding a Field to Existing Model

1. Edit `packages/database/prisma/schema.prisma`
2. Run `npm run db:push` from monorepo root
3. Use the new field immediately - types are auto-updated

### Resetting the Database (dev only)
```bash
cd packages/database
npx prisma migrate reset  # Drops all data, re-runs migrations + seed
```
