# Picker Components

Reusable selection components for companies, contacts, and locations.

## Overview

The picker components provide a consistent pattern for selecting entities in the Shopify app:
- Display selected item(s) with formatted details
- "Select" button when nothing selected
- "Change" button to modify selection
- Integration with Shopify's picker modal

## Components

### CompanyPicker

Select a company from the available list.

```tsx
import { CompanyPicker, type Company } from "~/components/CompanyPicker";

<CompanyPicker
  selectedCompanies={selectedCompanies}
  onSelect={handleSelect}
  onLoadCompanies={loadCompanies}
  selectButtonText="Select Company"
  changeButtonText="Change"
  emptyText=""
  onSuccess={handleSuccess}
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `selectedCompanies` | `Company[]` | Currently selected companies |
| `onSelect` | `(companies: Company[]) => void` | Called when selection changes |
| `onLoadCompanies` | `() => Promise<Company[]>` | Load available companies |
| `selectButtonText` | `string` | Text for select button |
| `changeButtonText` | `string` | Text for change button |
| `emptyText` | `string` | Text when nothing selected |
| `onSuccess` | `(companies: Company[]) => void` | Optional: Called on successful selection |

#### Company Type

```typescript
interface Company {
  id: string;
  name: string;
  accountNumber?: string;
}
```

### ContactPicker

Select a contact for a specific company.

```tsx
import { ContactPicker, type Contact } from "~/components/ContactPicker";

<ContactPicker
  selectedContacts={selectedContacts}
  onSelect={handleSelect}
  onLoadContacts={loadContacts}
  companyId={companyId}
  selectButtonText="Select Contact"
  changeButtonText="Change"
  emptyText=""
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `selectedContacts` | `Contact[]` | Currently selected contacts |
| `onSelect` | `(contacts: Contact[]) => void` | Called when selection changes |
| `onLoadContacts` | `() => Promise<Contact[]>` | Load available contacts |
| `companyId` | `string` | Filter contacts by company |
| `selectButtonText` | `string` | Text for select button |
| `changeButtonText` | `string` | Text for change button |
| `emptyText` | `string` | Text when nothing selected |

#### Contact Type

```typescript
interface Contact {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}
```

### LocationPicker

Select a location (shipping or billing address) for a company.

```tsx
import { LocationPicker, type Location } from "~/components/LocationPicker";

<LocationPicker
  selectedLocations={selectedLocations}
  onSelect={handleSelect}
  onLoadLocations={loadLocations}
  companyId={companyId}
  shippingOnly={true}
  selectButtonText="Select Shipping Location"
  changeButtonText="Change"
  emptyText=""
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `selectedLocations` | `Location[]` | Currently selected locations |
| `onSelect` | `(locations: Location[]) => void` | Called when selection changes |
| `onLoadLocations` | `() => Promise<Location[]>` | Load available locations |
| `companyId` | `string` | Filter locations by company |
| `shippingOnly` | `boolean` | Only show shipping addresses |
| `billingOnly` | `boolean` | Only show billing addresses |
| `selectButtonText` | `string` | Text for select button |
| `changeButtonText` | `string` | Text for change button |
| `emptyText` | `string` | Text when nothing selected |

#### Location Type

```typescript
interface Location {
  id: string;
  companyId: string;
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;
  zipcode?: string;
  country: string;
  isShippingAddress?: boolean;
  isBillingAddress?: boolean;
}
```

## Usage in OrderForm

The pickers are used in the CompanySection of OrderForm:

```tsx
function CompanySection({ ... }) {
  return (
    <s-section heading="Company">
      <CompanyPicker
        selectedCompanies={selectedCompanies}
        onSelect={handleCompanySelect}
        onLoadCompanies={onLoadCompanies}
        onSuccess={onCompanySuccess}
      />

      {company && (
        <>
          <ContactPicker
            selectedContacts={selectedContacts}
            onSelect={handleContactSelect}
            onLoadContacts={onLoadContacts}
            companyId={company.id}
          />

          <LocationPicker
            selectedLocations={selectedLocations}
            onSelect={handleShippingLocationSelect}
            onLoadLocations={onLoadLocations}
            companyId={company.id}
            shippingOnly
          />
        </>
      )}
    </s-section>
  );
}
```

## Cascading Selection

When a company changes:
1. Contact is cleared (must re-select for new company)
2. Shipping location is cleared
3. New contacts/locations are loaded for the selected company

## Selection Patterns

### Single Selection
All pickers currently support single selection. The selected item array will have at most one element.

### Display Format

When an item is selected, pickers display:
- **Company**: Name and account number badge
- **Contact**: Full name and email
- **Location**: Name and formatted address

## Grid Layout

LocationPicker supports grid spanning for full-width display:

```tsx
<s-grid gridTemplateColumns="1fr 1fr">
  <ContactPicker {...} />
  <LocationPicker gridColumn="1 / -1" {...} />  {/* Full width */}
</s-grid>
```

## Key Files

| File | Purpose |
|------|---------|
| `app/components/CompanyPicker.tsx` | Company selection component |
| `app/components/ContactPicker.tsx` | Contact selection component |
| `app/components/LocationPicker.tsx` | Location selection component |
