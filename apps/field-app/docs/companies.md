# Companies

Company management in the Field Sales app.

## Overview

Companies represent B2B customers that sales reps sell to. Companies are synced from Shopify by the shopify-app.

## Company Detail Page

The company detail page (`/companies/[id]`) displays:

```
┌─────────────────────────────────────┐
│ ← Company Name                      │
│   #AccountNumber • Territory        │
├─────────────────────────────────────┤
│ Recent Orders                [+ Create Order]
│   Order list with status badges     │
│   Links to /orders/create?companyId │
├─────────────────────────────────────┤
│ Contacts                            │
│   Name, title, email, phone         │
│   Primary badge, clickable links    │
├─────────────────────────────────────┤
│ Locations                           │
│   Name, address, phone              │
│   Primary/Shipping/Billing badges   │
└─────────────────────────────────────┘
```

### Features
- **Account Number** displayed prominently in header
- **Recent Orders** - Shows 5 most recent orders with status, date, and total
- **Create Order** link - Pre-populates company on order form
- **Contacts** - Clickable email (mailto:) and phone (tel:) links
- **Locations** - Full address with badge indicators

## Data Model

### Company
```typescript
{
  id: string;
  shopId: string;
  shopifyCompanyId?: string;    // Shopify GID (null for internal companies)
  name: string;
  accountNumber?: string;
  paymentTerms: PaymentTerms;
  territoryId?: string;
  assignedRepId?: string;
  syncStatus: SyncStatus;
  isActive: boolean;
}
```

### CompanyLocation
```typescript
{
  id: string;
  companyId: string;
  name: string;
  isPrimary: boolean;
  address1?: string;
  city?: string;
  province?: string;
  zipcode?: string;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
}
```

### CompanyContact
```typescript
{
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
  canPlaceOrders: boolean;
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/companies` | GET | List companies for rep's territory |
| `/api/companies/[id]` | GET | Get company details with locations & contacts |

The company detail endpoint returns contacts and locations sorted by `isPrimary` (primary first).

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(app)/companies/page.tsx` | Companies list |
| `src/app/(app)/companies/[id]/page.tsx` | Company detail |
| `src/app/api/companies/route.ts` | List companies |
| `src/app/api/companies/[id]/route.ts` | Get company detail |

## Territory Assignment

- Companies are auto-assigned to territories based on primary location zipcode
- Reps see only companies in their assigned territories
- MANAGER/ADMIN roles can see all companies
