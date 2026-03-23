# Current Status

## Last Updated: 2025-02-25
## Current Sprint: Sprint 3 — Products & Cart (COMPLETE)

### Sprint 3 Completed
- [x] Products API proxy to Shopify (`/api/products`)
- [x] Cart session management API (`/api/cart`)
- [x] Product catalog page with search and variant selection
- [x] Cart UI with add/remove/quantity controls
- [x] Order creation from cart (`/api/orders`)
- [x] Shopify GraphQL client for Admin API

### Sprint 2 Completed
- [x] Territory CRUD API endpoints (`/api/territories`, `/api/territories/[id]`)
- [x] Company sync webhook handlers (`/api/webhooks/shopify/companies`)
- [x] Company API endpoints (`/api/companies`, `/api/companies/[id]`)
- [x] Rep management API (`/api/reps`, `/api/reps/[id]`, `/api/reps/[id]/territories`)
- [x] Company list page with territory filtering
- [x] Company detail page with Shopify data

### Sprint 1 Completed
- [x] Initial repo creation with git
- [x] Shopify embedded app scaffolded from official React Router template
- [x] Basic Shopify OAuth flow (via @shopify/shopify-app-react-router)
- [x] Session storage with Prisma
- [x] App uninstalled webhook handler
- [x] .claude/ documentation directory created
- [x] Root monorepo package.json with workspaces
- [x] packages/shared with TypeScript types
- [x] Next.js field-app scaffold with App Router
- [x] Full directory structure per conventions
- [x] PostgreSQL Prisma schema (all tables with snake_case mapping)
- [x] Database migrations applied
- [x] Auth library (JWT with jose, bcrypt password hashing)
- [x] Redis client with cache helpers
- [x] Login/Logout API routes
- [x] Mobile-first UI pages (stubs)
- [x] Tenant provisioning on Shopify app install (afterAuth hook)
- [x] JWT verification in middleware with tenant/rep context injection
- [x] Auth context helper for API routes
- [x] Database seeded with test data

### Test Credentials
```
Email: rep@test.com
Password: password123

Email: admin@test.com
Password: password123
```

### API Endpoints Available

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/auth/login` | POST | Login with email/password |
| `/api/auth/logout` | POST | Clear auth cookies |
| `/api/territories` | GET, POST | List/create territories |
| `/api/territories/[id]` | GET, PUT, DELETE | Territory CRUD |
| `/api/companies` | GET | List companies with filtering |
| `/api/companies/[id]` | GET, PUT | Company details/update |
| `/api/reps` | GET, POST | List/create sales reps |
| `/api/reps/[id]` | GET, PUT, DELETE | Rep CRUD |
| `/api/reps/[id]/territories` | GET, POST | Rep territory assignments |
| `/api/reps/[id]/territories/[territoryId]` | DELETE | Remove territory assignment |
| `/api/webhooks/shopify/companies` | POST | Shopify company webhooks |
| `/api/products` | GET | Fetch products from Shopify |
| `/api/cart` | GET, PUT, DELETE | Cart session management |
| `/api/orders` | GET, POST | List/create orders |

### Next Up (Sprint 4 — Payments & Polish)
- [ ] Payment method vaulting (Stripe or Shopify)
- [ ] Order detail page with status updates
- [ ] Dashboard with recent orders and metrics
- [ ] Settings page with rep profile
- [ ] Order webhooks for status sync

### Known Technical Debt
1. Access tokens not encrypted in database (use encryption in production)
2. Refresh token rotation not implemented
3. No rate limiting on auth endpoints
4. Redis optional (gracefully degrades if not available)
5. Company webhooks need SHOPIFY_API_SECRET env var for HMAC verification
6. Products API fetches all products (no B2B catalog filtering yet)

## Monorepo Structure (Current)

```
/field-sales-manager
├── .claude/                    # Project documentation
├── .gitignore
├── package.json                # Root workspaces config
├── apps/
│   ├── shopify-app/           # Polaris embedded app
│   │   ├── prisma/
│   │   │   └── schema.prisma  # Session + Tenant (for provisioning)
│   │   └── app/
│   │       └── shopify.server.ts  # OAuth + afterAuth hook
│   └── field-app/             # Next.js field rep portal (phone auth + Twilio)
│       ├── package.json
│       ├── prisma/
│       │   ├── schema.prisma  # Full schema (source of truth)
│       │   ├── migrations/
│       │   └── seed.ts
│       └── src/
│           ├── app/           # App Router pages + API routes
│           ├── components/    # UI components
│           ├── lib/           # Auth, DB, Redis, Shopify utils
│           └── middleware.ts  # JWT verification
└── packages/
    └── shared/                # Shared TypeScript types
```

## Database Tables

| Table | Description |
|-------|-------------|
| `sessions` | Shopify OAuth sessions |
| `tenants` | Multi-tenant store records |
| `sales_reps` | Sales rep users |
| `territories` | Geographic territories |
| `territory_zipcodes` | Zip codes per territory |
| `rep_territories` | Rep-to-territory assignments |
| `companies` | Synced Shopify B2B companies |
| `payment_methods` | Vaulted payment methods |
| `cart_sessions` | In-progress carts |
| `orders` | Placed order references |

## Session Handoff Notes

**2025-02-25 (Session 4 - Sprint 3 Complete)**:
- Created Shopify GraphQL client for Admin API
- Created Products API that proxies to Shopify with search
- Created Cart API with add/update/remove/clear actions
- Created Orders API with Shopify draft order creation and completion
- Updated order page with full product catalog, variant selection, and cart UI
- Mobile-first design with bottom sheets and touch-friendly controls
- Build passes, ready for Sprint 4

**2025-02-25 (Session 3 - Sprint 2 Complete)**:
- Created Territory CRUD API with pagination, search, and role-based access
- Created Company webhook handler for Shopify company sync
- Created Company API with territory filtering and role-based visibility
- Created Rep management API with territory assignments
- Updated Company list page with search, territory filter, and pagination
- Updated Company detail page with real data fetching
- Added shared types for territories, reps, and API requests
- Build passes, ready for Sprint 3

**2025-02-25 (Session 2 - Sprint 1 Complete)**:
- Scaffolded full monorepo with main-app and shared packages
- Created PostgreSQL schema with snake_case DB / camelCase code convention
- Implemented tenant provisioning in Shopify app's afterAuth hook
- Built JWT authentication with middleware verification
- Created auth context helper for API routes
- Seeded database with test tenant, reps, territory, and company
- Build passes, ready for Sprint 2

**To start the app**:
```bash
cd apps/field-app
npm run dev
```
Then visit http://localhost:3001/login

**To test ordering flow**:
1. Login with test credentials
2. Go to Accounts → click a company
3. Click "New Order"
4. Search/browse products, tap to add to cart
5. Review cart and click "Place Order"

**Note**: Products and order creation require a valid Shopify store with products. The test tenant uses a placeholder access token that won't work with real Shopify API calls.

**Next session should**: Start Sprint 4 with payment vaulting and dashboard metrics.