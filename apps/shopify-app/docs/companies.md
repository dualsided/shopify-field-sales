# Companies

B2B account management and Shopify sync.

## Overview

Companies represent B2B customers with multiple locations and contacts. Companies can be:
- **Shopify-managed**: Synced from Shopify B2B (Shopify Plus)
- **App-managed**: Created directly in the app

## Data Model

### Company
```typescript
{
  id: string;
  shopId: string;
  shopifyCompanyId?: string;    // Numeric ID if synced from Shopify
  name: string;
  accountNumber?: string;       // External ID / account number
  paymentTerms: PaymentTerms;   // DUE_ON_ORDER, NET_30, etc.
  assignedRepId?: string;       // Direct rep assignment
  isActive: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt?: Date;
  locations: CompanyLocation[];
  contacts: CompanyContact[];
}
```

### CompanyLocation
```typescript
{
  id: string;
  companyId: string;
  shopifyLocationId?: string;   // Numeric ID if synced
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;        // State code: "CA", "NY"
  zipcode?: string;
  country: string;
  countryCode: string;
  phone?: string;
  isPrimary: boolean;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
  territoryId?: string;         // Auto-assigned based on address
}
```

### CompanyContact
```typescript
{
  id: string;
  companyId: string;
  shopifyContactId?: string;    // Numeric ID
  shopifyCustomerId?: string;   // Linked Shopify customer
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
  canPlaceOrders: boolean;
}
```

## Shopify B2B Import

Import companies from Shopify Admin (requires Shopify Plus):

```typescript
import { importCompaniesFromShopify } from "~/services/company.server";

const result = await importCompaniesFromShopify(shopId, admin);
// { success: true, imported: 25, updated: 10 }
```

### What Gets Imported

- Company name and external ID
- All company locations with addresses
- Company contacts (linked to Shopify customers)

### Automatic Territory Alignment

After import, each location is automatically aligned to a territory:

```typescript
// Called for each imported location
await alignLocationToTerritory(shopId, locationId);
```

## Shopify-Managed vs App-Managed

| Feature | Shopify-Managed | App-Managed |
|---------|-----------------|-------------|
| Source | Imported from Shopify | Created in app |
| `shopifyCompanyId` | Set | null |
| Edit name/account# | No (managed in Shopify) | Yes |
| Edit payment terms | No | Yes |
| Assign rep | Yes | Yes |
| Deactivate | No | Yes |

```typescript
// Check if Shopify-managed
const isShopifyManaged = company.shopifyCompanyId !== null;
```

## Key Functions

### company.server.ts

| Function | Description |
|----------|-------------|
| `getCompanies(shopId)` | List companies |
| `getCompanyById(shopId, id)` | Company with locations/contacts |
| `createCompany(input)` | Create app-managed company |
| `updateCompany(shopId, id, input)` | Update company |
| `updateCompanyRepAssignment(...)` | Assign rep |
| `deactivateCompany(shopId, id)` | Soft delete (app-managed only) |
| `importCompaniesFromShopify(...)` | Bulk import from Shopify |
| `alignLocationToTerritory(...)` | Assign location to territory |

## Customer Sync

Contacts can be synced to Shopify as customers for payment method vaulting:

```typescript
import { syncContactToShopifyCustomer } from "~/services/customer.server";

const result = await syncContactToShopifyCustomer(contactId, admin);
// { success: true, shopifyCustomerId: "12345" }
```

See [customer.server.ts](../app/services/customer.server.ts) for:
- `syncContactToShopifyCustomer()` - Create/link Shopify customer
- `getContactPaymentMethods()` - Get saved payment methods
- `syncCompanyContactsToShopify()` - Bulk sync all contacts

## Rep Assignment

Companies can be assigned to reps in two ways:

1. **Direct Assignment** - `company.assignedRepId`
2. **Territory-Based** - Rep has access via location's territory

```typescript
// Direct assignment
await updateCompanyRepAssignment(shopId, companyId, repId);

// Territory access (automatic)
// Location in territory → Rep assigned to territory → Rep can access company
```

## Routes

| Route | Purpose |
|-------|---------|
| `app.companies._index.tsx` | Company list |
| `app.companies.$id.tsx` | Company detail/edit |
| `app.companies.create.tsx` | Create company |

## Webhooks

Company data is kept in sync via webhooks:

| Topic | Trigger | Action |
|-------|---------|--------|
| `COMPANIES_CREATE` | Company created in Shopify | Import to database |
| `COMPANIES_UPDATE` | Company modified | Update local record |
| `COMPANIES_DELETE` | Company deleted | Deactivate local record |
| `COMPANY_LOCATIONS_CREATE` | Location added | Import and align |
| `COMPANY_LOCATIONS_UPDATE` | Location modified | Update and realign |
| `COMPANY_LOCATIONS_DELETE` | Location removed | Deactivate |

## Payment Terms

| Value | Description |
|-------|-------------|
| `DUE_ON_ORDER` | Payment due immediately |
| `NET_7` | Due in 7 days |
| `NET_15` | Due in 15 days |
| `NET_30` | Due in 30 days |
| `NET_60` | Due in 60 days |
| `NET_90` | Due in 90 days |
