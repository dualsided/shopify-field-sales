# Field App Documentation

Technical documentation for the Field Sales Manager mobile app.

## Overview

Mobile-first web application for field sales representatives to:
- View and manage assigned accounts (companies)
- Browse product catalog
- Build and edit orders
- Track order history

## Documentation Index

| Document | Description |
|----------|-------------|
| [Orders](./orders.md) | Order lifecycle, editing, statuses, API |
| [Accounts](./accounts.md) | Companies, contacts, locations |
| [Products](./products.md) | Catalog, variants, availability |
| [Promotions](./promotions.md) | Discount types, evaluation logic |
| [Cart](./cart.md) | Cart sessions, line items |
| [Auth](./auth.md) | Authentication, roles, multi-tenancy |

## Quick Reference

### Key Directories
```
src/
├── app/
│   ├── (app)/           # Authenticated routes
│   │   ├── accounts/    # Company management
│   │   ├── orders/      # Order list & detail
│   │   ├── dashboard/   # Home dashboard
│   │   └── settings/    # User settings
│   ├── api/             # API route handlers
│   └── login/           # Public login page
├── components/          # React components
├── lib/                 # Utilities (auth, db, redis)
├── services/            # Business logic
└── types/               # TypeScript definitions
```

### Data Flow
```
Field App ←→ Database ←→ Shopify App ←→ Shopify
           (shared)
```

- Field app does NOT interact with Shopify directly
- Reads/writes to shared PostgreSQL database
- Shopify app handles all Shopify API communication
- Products & companies synced by shopify-app webhooks

### API Response Format
All API endpoints return:
```typescript
{ data: T | null, error: { code: string, message: string } | null }
```

### Money Convention
- All prices stored in cents as integers (`totalCents`, `priceCents`)
- Convert to dollars only for display: `cents / 100`
