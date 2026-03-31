# Accounts (Companies)

Company management in the Field Sales app.

## Overview

Accounts represent B2B customers (companies) that sales reps sell to. Companies are synced from Shopify by the shopify-app.

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

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(app)/accounts/page.tsx` | Accounts list |
| `src/app/(app)/accounts/[id]/page.tsx` | Account detail |
| `src/app/api/companies/route.ts` | List companies |
| `src/app/api/companies/[id]/route.ts` | Get company detail |

## Territory Assignment

- Companies are auto-assigned to territories based on primary location zipcode
- Reps see only companies in their assigned territories
- MANAGER/ADMIN roles can see all companies
