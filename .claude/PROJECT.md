# Sales Field Ordering Platform — Project Context

## What This Is
Multi-tenant B2B field sales ordering platform. Sales reps use a mobile-first web app to manage accounts and place orders. Shopify is the backend for companies, products, orders, and payments. A separate Shopify embedded app handles merchant configuration.

## Architecture

### Two Apps in a Monorepo
1. **Shopify Embedded App** (Polaris + Vite/React Router): Thin config app inside Shopify Admin
   - OAuth install flow
   - Payment strategy configuration
   - Webhook registration
   - Sales channel activation
   - Metafield schema provisioning
   - Does NOT handle rep workflows

2. **Main App** (Next.js, App Router, Server Components): Mobile-first rep-facing platform
   - Rep authentication (email/password, JWT sessions)
   - Territory-based company filtering
   - Cart building and order placement
   - Payment processing
   - All Shopify Admin GraphQL calls via stored access tokens

### Infrastructure
- **Database**: PostgreSQL on Render (shared between both apps)
- **Cache**: Redis for sessions, product cache, rate limiting
- **Hosting**: Render (both apps + DB + Redis)
- **Repo**: Monorepo structure with npm workspaces

### Monorepo Structure
```
shopify-field-sales/
├── apps/
│   ├── field-app/        # Next.js mobile-first rep app (port 3001)
│   └── shopify-app/      # React Router embedded Shopify app
├── packages/
│   └── database/         # Shared Prisma schema & client
│       ├── prisma/
│       │   ├── schema.prisma  # THE database schema
│       │   ├── migrations/
│       │   └── seed.ts
│       └── src/
│           ├── client.ts      # Prisma client singleton
│           └── index.ts       # Exports client + types
└── package.json          # Workspace root with db:* scripts
```

## Tech Stack
- Next.js 14+ (App Router, Server Components)
- TypeScript (strict)
- Tailwind CSS (mobile-first)
- Prisma ORM (PostgreSQL)
- Shopify Admin GraphQL API (2025-01)
- Shopify App Bridge + Polaris (embedded app)
- Redis (ioredis)

## Multi-Tenant Model
Each Shopify store install = one tenant. Reps belong to a tenant.
Middleware resolves tenant from rep session on every request.
Shopify access tokens stored encrypted in tenants table.

## Key Abstractions
- **PaymentProvider** interface
  - ShopifyTermsProvider — B2B payment terms (net 30/60)
  - ShopifyVaultProvider — Vault cards via Shopify, charge with orderCreateMandatePayment
- **CompanyRepository** interface (API now, offline SQLite later)
- **ShopifyService** (tenant-scoped GraphQL client)
- **TerritoryService** (zip → company resolution)

## Core Features

### 1. Sales Rep Management (lives in Main App DB, NOT Shopify)
- Rep auth (email/password, JWT sessions)
- Roles: rep, manager, admin
- Territory assignment (reps → territories → zip codes)
- Reps see only companies in their territory zip codes

### 2. Territory System
- Territories have names and collections of zip codes
- Companies auto-assign to territories based on Shopify Company primary location zip
- Reps are assigned to one or more territories
- When a rep logs in, they see companies filtered by their territory zips

### 3. B2B Companies (Shopify Companies, synced via webhooks)
- Companies are created/managed in Shopify using B2B Company APIs
- Webhooks (companies/create, companies/update) sync to local company_sync table
- Local table stores: shopify_company_id, primary_zipcode, territory_id, assigned_rep_id
- Hybrid approach: use Shopify metafields for data useful in Shopify (account tier), keep territory/rep mapping in own DB

### 4. Cart & Order Workflow
- Products queried from Shopify via GraphQL (cached in Redis)
- Cart built in the app (stored in cart_sessions table)
- Order placed via draftOrderCreate → draftOrderComplete
- `purchasingEntity` on draft order ties it to the Shopify Company
- Order attributed to the Sales Channel in Shopify reporting
- If using B2B Catalogs, query company-specific pricing

### 5. Payments (abstracted)
- PaymentProvider interface with vaultPaymentMethod, getPaymentMethods, processOrderPayment, removePaymentMethod
- Option A (Shopify Terms): draftOrderComplete with paymentTerms, Shopify sends invoice
- Option B (Shopify Vault): vault card via Shopify, charge with orderCreateMandatePayment
- Merchant configures which option in Shopify embedded app
- Requires `write_payment_mandate` scope for vaulted card payments

### 6. Webhooks
- Shopify → Main App webhook endpoints
- companies/create, companies/update → sync to territory mapping
- orders/updated → update local order status
- products/update → invalidate Redis cache
- app/uninstalled → deactivate tenant

## Main App Page Structure
```
/auth/login              → Step login
/dashboard               → KPIs, recent orders, quick actions
/accounts                → Company list (territory-filtered, searchable)
  /accounts/[id]         → Company detail: contacts, order history, payment
  /accounts/[id]/order   → Cart builder (core workflow)
  /accounts/[id]/payment → Manage payment methods
/orders                  → Order history with status filters
  /orders/[id]           → Order detail + tracking
/settings                → Rep profile
```

## Build Sequence

**Sprint 1 — Foundation**: Monorepo scaffold, Shopify app OAuth install, tenant provisioning, DB schema/migrations, webhook endpoint, multi-tenant middleware.

**Sprint 2 — Companies & Territories**: Territory CRUD, company sync from webhooks, rep management with territory assignment, company list filtered by territory.

**Sprint 3 — Cart & Orders**: Product catalog query + Redis caching, cart builder UI, draft order creation flow, order history pages.

**Sprint 4 — Payments**: Payment abstraction layer, Shopify Terms provider, Stripe Vault provider, payment config in embedded app.

**Sprint 5 — Polish & PWA**: Dashboard KPIs, PWA manifest + service worker, mobile UX refinement.

## Database Management

**CRITICAL:** Both apps share a single database via `@field-sales/database` package. Never create separate Prisma schemas in individual apps.

### Schema Location
Edit `packages/database/prisma/schema.prisma` — this is the single source of truth.

### Commands (run from monorepo root)
```bash
npm run db:push       # Push schema changes (dev - no migration file)
npm run db:migrate    # Create migration file (for production)
npm run db:generate   # Regenerate Prisma client only
npm run db:seed       # Run seed script
npm run db:studio     # Open Prisma Studio GUI
```

### Making Schema Changes
1. Edit `packages/database/prisma/schema.prisma`
2. Run `npm run db:push` from monorepo root
3. Both apps automatically get updated types via shared package

### Importing in Apps
```typescript
// field-app
import { prisma } from '@/lib/db/prisma';
import type { Company, Order } from '@field-sales/database';

// shopify-app
import prisma from "../db.server";
import type { Shop, SalesRep } from "@field-sales/database";
```

### Adding New Models
Always include `shopId` for multi-tenancy and add relation to Shop model:
```prisma
model NewModel {
  id        String   @id @default(cuid())
  shopId    String
  // ... fields
  shop      Shop     @relation(fields: [shopId], references: [id])
  @@index([shopId])
  @@map("new_models")
}
```

### Reset Database (dev only)
```bash
cd packages/database
npx prisma migrate reset  # Drops data, re-runs migrations + seed
```

## Current Sprint
[See STATUS.md for current work]

## Important Decisions
[See DECISIONS.md for full ADR log]
