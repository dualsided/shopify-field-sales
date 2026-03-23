# Architecture Decisions

## ADR-001: Next.js over React Router + Express for Field App
**Date**: 2025-02-25
**Decision**: Next.js with App Router
**Rationale**:
- Built-in API routes eliminate separate Express server
- Server components improve mobile performance on cellular networks
- Middleware handles multi-tenant resolution elegantly
- PWA → Capacitor path is cleaner for future hybrid mobile
- Strong TypeScript support and ecosystem
**Status**: Accepted

## ADR-002: Payment Provider Abstraction
**Date**: 2025-02-25
**Decision**: Abstract PaymentProvider interface with swappable implementations
**Rationale**:
- Shopify doesn't currently expose card vaulting via GraphQL API
- Need flexibility to support multiple payment methods per tenant
- Build with Stripe now, swap to Shopify native when available without refactoring cart/order layers
**Implementations**:
- `ShopifyTermsProvider` — B2B payment terms (net 30/60), Shopify sends invoice
- `StripeVaultProvider` — Vault cards in Stripe, charge on order, mark Shopify order as paid
- `ShopifyVaultProvider` — Future: when Shopify exposes vaulting API
**Status**: Accepted

## ADR-003: Monorepo with Shared Packages
**Date**: 2025-02-25
**Decision**: Single repo, apps/ and packages/ structure
**Rationale**:
- Shared TypeScript types between Shopify app and main app
- Payment provider as isolated, testable package
- Single Git history for coordinated changes
- Simplified deployment pipeline
**Structure**:
```
/field-sales-manager
├── apps/
│   ├── shopify-app/    # Shopify Admin embedded app
│   └── field-app/      # Rep-facing portal (phone auth + Twilio)
└── packages/
    ├── shared/
    └── payment-provider/
```
**Status**: Accepted

## ADR-004: Prisma as ORM
**Date**: 2025-02-25
**Decision**: Prisma over raw SQL or Drizzle
**Rationale**:
- Strong TypeScript integration with generated types
- Declarative schema migrations
- Good PostgreSQL support
- Familiar to most developers
- Built-in connection pooling
**Trade-offs**:
- Slightly more overhead than raw SQL
- Some complex queries may need raw SQL fallback
**Status**: Accepted

## ADR-005: Hybrid Data Storage (Shopify + Local DB)
**Date**: 2025-02-25
**Decision**: Store territory/rep assignments locally, sync company data from Shopify via webhooks
**Rationale**:
- Shopify is source of truth for company/product/order data
- Territory and rep assignments are app-specific, don't belong in Shopify
- Local company_sync table caches Shopify company data for fast queries
- Webhooks keep local cache in sync
**Implementation**:
- `company_sync` table: shopify_company_id, company_name, primary_zipcode, territory_id, assigned_rep_id
- Webhooks: companies/create, companies/update → update company_sync
- Metafields: Only for data useful in Shopify admin (e.g., account tier)
**Status**: Accepted

## ADR-006: JWT for Rep Authentication
**Date**: 2025-02-25
**Decision**: JWT tokens for rep authentication, not Shopify sessions
**Rationale**:
- Reps are not Shopify users, they're app-specific users
- JWT allows stateless authentication
- Can include tenant_id and rep_id in token payload
- Redis for token blacklisting on logout
**Implementation**:
- Login: email/password → JWT with tenant_id, rep_id, role
- Middleware: validate JWT, inject tenant/rep into request context
- Refresh tokens stored in Redis
**Status**: Accepted

## ADR-007: Redis for Caching and Sessions
**Date**: 2025-02-25
**Decision**: Redis for product caching, rep sessions, and rate limiting
**Rationale**:
- Products rarely change, cache reduces Shopify API calls
- Rep sessions need fast reads
- Rate limiting protects against API abuse
**Cache Strategy**:
- Products: 15-minute TTL, invalidate on products/update webhook
- Companies: 5-minute TTL, invalidate on company webhook
- Sessions: Match JWT expiry
**Status**: Accepted

## ADR-008: Shopify Sales Channel Attribution
**Date**: 2025-02-25
**Decision**: Register as Shopify Sales Channel for order attribution
**Rationale**:
- Orders placed through the app appear in Shopify as "Field Sales" channel
- Enables accurate sales reporting by channel
- Required for proper B2B order flow
**Implementation**:
- Activate sales channel during app install
- Include `salesAttributionAppId` in draft order creation
**Status**: Accepted

## ADR-009: Offline-Ready Architecture (Future)
**Date**: 2025-02-25
**Decision**: Structure data access behind repository interfaces for future offline support
**Rationale**:
- Field reps often work in areas with poor connectivity
- Repository pattern allows swapping online API for offline SQLite
- Not building offline now, but architecture should support it
**Future Path**:
- Wrap Capacitor around Next.js PWA
- Add SQLite via `@capacitor-community/sqlite`
- CompanyRepository switches between API and SQLite based on connectivity
**Status**: Proposed (architecture only, not implementing)
