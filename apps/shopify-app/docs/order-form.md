# OrderForm Component

Reusable form component for creating and editing orders in the Shopify app.

## Overview

`OrderForm` is a comprehensive form component that handles:
- Company/contact/location selection
- Product selection and quantity management
- Automatic promotion application
- Shipping option selection
- Order summary calculations
- Notes and PO number entry
- Payment terms configuration

## Usage

```tsx
import { OrderForm, type OrderFormData } from "~/components/OrderForm";

<OrderForm
  mode="create"
  onSave={handleSave}
  onCancel={handleCancel}
  onLoadProducts={loadProducts}
  onLoadShippingOptions={loadShippingOptions}
  onLoadCompanies={loadCompanies}
  onLoadContacts={loadContacts}
  onLoadLocations={loadLocations}
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `mode` | `"create" \| "edit"` | Form mode |
| `initialData` | `Partial<OrderFormData>` | Initial form data for edit mode |
| `onSave` | `(data: OrderFormData) => void` | Called on save |
| `onCancel` | `() => void` | Called on cancel/discard |
| `onSearchProducts` | `(query: string) => Promise<ProductSearchResult[]>` | Product search handler |
| `onLoadProducts` | `() => Promise<ProductSearchResult[]>` | Load all products |
| `onLoadShippingOptions` | `() => Promise<ShippingOption[]>` | Load shipping options |
| `onLoadCompanies` | `() => Promise<Company[]>` | Load companies |
| `onLoadContacts` | `() => Promise<Contact[]>` | Load contacts for company |
| `onLoadLocations` | `() => Promise<Location[]>` | Load locations for company |
| `onCalculateTax` | `(input: TaxCalculationInput) => Promise<TaxCalculationResult>` | Calculate tax via Shopify |
| `onEvaluatePromotions` | `(input: PromotionEvaluationInput) => Promise<PromotionEvaluationResult>` | Evaluate promotions in real-time |
| `isSubmitting` | `boolean` | Disable save button while submitting |
| `onSubmitForApproval` | `(comment?: string) => void` | Submit DRAFT order for approval |
| `onApprove` | `(comment?: string) => void` | Approve AWAITING_REVIEW order |
| `onDecline` | `(comment?: string) => void` | Decline order (return to DRAFT) |
| `onAddComment` | `(comment: string) => void` | Add comment to timeline |
| `timelineEvents` | `TimelineEvent[]` | Timeline events to display |
| `readonly` | `boolean` | Disable editing (for non-draft orders) |
| `shopDomain` | `string` | Shop domain for Shopify links |
| `children` | `React.ReactNode` | Additional content for sidebar (e.g., custom actions) |

## Real-Time Promotions

Promotions are evaluated in **real-time** as users edit line items, providing immediate feedback on discounts and free items.

### How It Works

1. **User edits line items** in the OrderForm (add products, change quantities)
2. **Debounced trigger** (300ms) to avoid excessive API calls
3. **API call** to `/api/promotions/evaluate` with current line items
4. **Server evaluates** using the shared promotion engine
5. **UI updates immediately** with free items and discounts

```
[Line Items Change] → [300ms debounce] → [API Evaluate] → [UI Updated]
```

### Server-Side Validation

When the order is saved, promotions are re-evaluated server-side in `updateOrderLineItems()` to ensure consistency and prevent client-side manipulation.

### Promotion Line Items

Free items from promotions are displayed as regular line items with promotion tracking:

- `isFreeItem: true` - Marks the item as promotion-generated
- `promotionId` - Links to the promotion that created it
- `promotionName` - Display name for the promotion

### User Interaction

- **Free items display** with "Free - {promotionName}" label
- **Quantity is read-only** for promotion items (controlled by promotion rules)
- **Users can remove** free items if they don't want them
- **Removed items won't re-add** until line items change again

### Promotion Display

- **Products Section**: Free items shown as $0 line items with promotion label
- **Order Summary**: ORDER_TOTAL scope discounts shown as "Order Total Discount"
- **Promotions Applied Section**: Lists all applied promotions with their discount amounts

See [Promotions](./promotions.md) for full documentation.

## Form Sections

### CompanySection
Handles company, contact, and shipping location selection using picker components.

### ProductsSection
- Browse/add products via picker
- Update quantities with number field
- Remove items with X button
- Shows product images and variants

### OrderSummarySection
- Subtotal with item count
- Order Total Discount (for order-level promotions)
- Shipping selection dropdown
- Estimated tax (calculated via Shopify API)
- Total

## Tax Calculation

The OrderForm automatically calculates estimated tax using Shopify's `draftOrderCalculate` API. This ensures accurate tax rates based on:
- Shipping address (state/province, country)
- Product taxability settings in Shopify
- Customer tax exemptions

### How It Works

1. **User selects shipping address** and adds products
2. **Debounced trigger** (500ms) to avoid excessive API calls
3. **API call** to `/api/tax/calculate` with line items and shipping address
4. **Shopify calculates** tax using `draftOrderCalculate` mutation
5. **UI updates** with estimated tax amount and recalculated total

```
[Shipping Address Selected] → [500ms debounce] → [API Call] → [Tax Updated]
```

### Tax Calculation Input

```typescript
interface TaxCalculationInput {
  lineItems: Array<{
    shopifyVariantId?: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  shippingAddress?: {
    address1?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    countryCode?: string;
  } | null;
  customerId?: string | null;
  shippingCents?: number;
}
```

### Tax Calculation Result

```typescript
interface TaxCalculationResult {
  taxCents: number;
  taxLines: TaxLine[];
}

interface TaxLine {
  title: string;      // e.g., "CA State Tax"
  rate: number;       // e.g., 0.0725 for 7.25%
  amountCents: number;
}
```

### Implementation

The tax calculation endpoint uses Shopify's `draftOrderCalculate` mutation which calculates totals without creating an actual draft order:

```graphql
mutation DraftOrderCalculate($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    calculatedDraftOrder {
      totalTax
      taxLines {
        title
        rate
        priceSet { shopMoney { amount } }
      }
    }
    userErrors { field message }
  }
}
```

### UI Behavior

- **Spinner** displays next to "Estimated tax" while calculating
- **Tax updates automatically** when shipping address or line items change
- **Detailed breakdown** available in Shopify after order is submitted

### TimelineSection
Displays the order timeline with all events and comments. See [Orders - Timeline](./orders.md#order-timeline) for details on event types.

- Shows events in reverse chronological order (newest first)
- Each event shows author, timestamp, event message, and optional comment
- Add Comment button for admins to add standalone comments
- Uses event-specific icons for visual distinction

### PaymentSection
Displays payment terms and method selection based on selected location and contact:

- **Payment Terms Display**: Shows terms from the selected shipping location (e.g., "Net 30")
- **Due Date**: Calculated and displayed for NET terms
- **Payment Method Selection**: If contact has vaulted cards, shows dropdown to select one
- **Invoice Fallback**: Option to "Send Invoice Instead" if cards are available
- **No Card Message**: If no vaulted cards, shows message that invoice will be sent

```
┌─────────────────────────────────────────────┐
│ Payment                                     │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ Payment Terms          Net 30           │ │
│ │ Due Date               May 6, 2026      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Payment Method                              │
│ ┌─────────────────────────────────────────┐ │
│ │ Visa •••• 4242 (12/25) (Default)    ▼  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Sidebar
- PO Number section
- Notes section

## Data Types

### OrderFormData

```typescript
interface OrderFormData {
  id?: string;
  orderNumber?: string;
  status?: OrderStatus;
  shopifyDraftOrderId?: string | null;    // Shopify draft order GID
  shopifyOrderId?: string | null;         // Shopify order GID (after approval)
  shopifyOrderNumber?: string | null;     // Shopify order number
  company: OrderCompany | null;
  contact: OrderContact | null;           // Includes paymentMethods[]
  salesRepName?: string;
  shippingLocation: OrderLocation | null; // Includes payment terms
  billingLocation: OrderLocation | null;
  lineItems: OrderLineItem[];
  appliedPromotions: OrderPromotion[];
  selectedShippingOption: ShippingOption | null;
  note: string;
  poNumber: string;
  paymentTerms: PaymentTerms;             // From location or manual
  paymentMethodId?: string | null;        // Selected vaulted card
  paymentDueDate?: Date | null;           // Calculated from terms
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  taxLines: TaxLine[];              // Tax breakdown from Shopify
  totalCents: number;
  currency: string;
}
```

### OrderLocation (with Payment Terms)

```typescript
interface OrderLocation {
  id: string;
  name: string;
  address1: string | null;
  // ... address fields ...

  // Payment terms from Shopify B2B
  paymentTermsType?: string | null;  // NET_30, DUE_ON_RECEIPT, etc.
  paymentTermsDays?: number | null;  // Days for NET terms
  checkoutToDraft?: boolean;         // Requires merchant review
}
```

### OrderContact (with Payment Methods)

```typescript
interface OrderContact {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  paymentMethods?: PaymentMethod[];  // Vaulted cards from Shopify
}

interface PaymentMethod {
  id: string;
  provider: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}
```

### OrderLineItem

```typescript
interface OrderLineItem {
  id: string;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  imageUrl?: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  isFreeItem?: boolean;           // True if added by promotion
  promotionId?: string | null;    // ID of promotion that added this item
  promotionName?: string | null;  // Name of promotion for display
}
```

### TimelineEvent

```typescript
interface TimelineEvent {
  id: string;
  authorType: "SALES_REP" | "ADMIN" | "SYSTEM";
  authorId: string | null;
  authorName: string;
  eventType: string;           // submitted, approved, declined, comment, etc.
  metadata: Record<string, unknown> | null;
  comment: string | null;
  createdAt: string;           // ISO date string
}
```

## Save Bar Integration

The form integrates with Shopify's `ui-save-bar` for dirty state tracking:
- Shows save bar when form has unsaved changes
- Disables save button if no products added
- Hides save bar on successful save or discard

## Action Modals

The OrderForm uses modal dialogs for status-changing actions (Submit, Approve, Decline). Each modal allows an optional comment that gets recorded in the timeline.

Modals use the reusable `Modal` component which follows Shopify's `commandFor`/`command` web component pattern:

```tsx
import { Modal, ModalTrigger } from "~/components/Modal";

// Trigger button
<ModalTrigger modalId="my-modal" variant="primary">
  Open Modal
</ModalTrigger>

// Modal with actions
<Modal
  id="my-modal"
  heading="Confirm Action"
  primaryAction={{
    content: "Confirm",
    onAction: handleConfirm,
  }}
  secondaryActions={[
    { content: "Cancel", variant: "tertiary" },
  ]}
>
  <s-text>Are you sure?</s-text>
</Modal>
```

## Key Files

- `apps/shopify-app/app/components/OrderForm.tsx` - Main form component
- `apps/shopify-app/app/components/Modal.tsx` - Reusable modal component
- `apps/shopify-app/app/routes/api.tax.calculate.tsx` - Tax calculation API endpoint
