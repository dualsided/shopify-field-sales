# Field App Documentation

Technical documentation for the Field Sales Manager mobile app.

## Overview

Mobile-first web application for field sales representatives to:
- View and manage assigned companies
- Browse product catalog
- Build and edit orders
- Track order history

## Documentation Index

| Document | Description |
|----------|-------------|
| [Orders](./orders.md) | Order lifecycle, OrderForm component, API |
| [Companies](./companies.md) | Companies, contacts, locations |
| [Products](./products.md) | Catalog, variants, availability |
| [Promotions](./promotions.md) | Discount types, evaluation logic |
| [Cart](./cart.md) | Cart sessions, line items |
| [Auth](./auth.md) | Authentication, roles, multi-tenancy |
| [Components](./components.md) | Component patterns and framework |

## Quick Reference

### Key Directories
```
src/
├── app/
│   ├── (app)/           # Authenticated routes
│   │   ├── companies/   # Company management
│   │   ├── orders/      # Order list, create, detail
│   │   ├── dashboard/   # Home dashboard
│   │   └── account/     # Sales rep account
│   ├── api/             # API route handlers
│   └── login/           # Public login page
├── components/
│   ├── ui/              # Reusable UI primitives (BottomSheet, SaveBar)
│   ├── pickers/         # Selection components (Company, Contact, etc.)
│   ├── orders/          # Order form components
│   └── [feature]/       # Feature-specific components
├── hooks/               # Custom React hooks
│   ├── useOrderForm.ts  # Order form state
│   └── usePromotions.ts # Promotion evaluation
├── lib/                 # Utilities (auth, db, redis)
├── services/            # Business logic
└── types/               # TypeScript definitions
```

### Component Architecture

```
UI Primitives (ui/)
    ↓
Pickers (pickers/)
    ↓
Form Sections (orders/, [feature]/)
    ↓
Form Orchestrators (OrderForm, etc.)
    ↓
Pages (app/(app)/)
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

## Component Patterns

### BottomSheet Modal
Use for mobile-friendly selection:
```tsx
import { BottomSheet } from '@/components/ui';

<BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Item" height="half">
  {/* Content */}
</BottomSheet>
```

### Picker Components
Use for entity selection with BottomSheet:
```tsx
import { CompanyPicker, ContactPicker } from '@/components/pickers';

<CompanyPicker selected={company} onSelect={setCompany} />
<ContactPicker companyId={company?.id} selected={contact} onSelect={setContact} />
```

### Form State Hooks
Use custom hooks for complex form state:
```tsx
import { useOrderForm } from '@/hooks/useOrderForm';

const { formData, isDirty, resetForm, setCompany, addLineItem } = useOrderForm();
```

### SaveBar
Use for dirty form state:
```tsx
import { SaveBar } from '@/components/ui';

<SaveBar isDirty={isDirty} onSave={handleSave} onDiscard={resetForm} />
```

## Adding New Features

See [Components](./components.md) for the full framework guide. Quick checklist:

1. Create pickers in `src/components/pickers/`
2. Create form hook in `src/hooks/use[Feature]Form.ts`
3. Create form sections in `src/components/[feature]/`
4. Create form orchestrator in `src/components/[feature]/[Feature]Form.tsx`
5. Create API endpoints in `src/app/api/[feature]/`
6. Create pages in `src/app/(app)/[feature]/`
7. Export from index files
8. Update documentation
