# Shopify Embedded App

Shopify Admin embedded application for merchant configuration of the Field Sales Manager platform.

## Overview

This is a React Router-based Shopify app that runs inside the Shopify Admin. Merchants use it to configure their field sales operations including sales reps, territories, products, and payment settings.

## Tech Stack

- **Framework**: React Router 7 (Vite-based)
- **Language**: TypeScript
- **UI**: Shopify Polaris Web Components
- **Database**: PostgreSQL via Prisma ORM
- **Authentication**: Shopify OAuth (managed by Shopify CLI)

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- PostgreSQL 14+
- A Shopify Partner account and development store

### Installation

```bash
# From the monorepo root
npm install

# Generate Prisma client
cd apps/shopify-app
npx prisma generate
```

### Link to Shopify App

```bash
shopify app config link
```

This connects your local development to your Shopify app in the Partner Dashboard.

### Development

```bash
# From monorepo root
npm run dev:shopify

# Or from this directory
npm run dev
```

The Shopify CLI will:
1. Start the dev server
2. Create a tunnel to your local machine
3. Open the app in your development store

Press `P` to open the app URL.

### Environment Variables

The Shopify CLI manages most environment variables. Your `.env` will contain:

```env
SHOPIFY_API_KEY=""
SHOPIFY_API_SECRET=""
SCOPES="read_customers,read_companies,write_companies,read_orders,write_draft_orders,read_products"
SHOPIFY_APP_URL=""
DATABASE_URL="postgresql://user:password@localhost:5432/field_sales_manager"
```

## Project Structure

```
app/
├── routes/                    # React Router routes
│   ├── app._index.tsx        # Dashboard/home
│   ├── app.reps._index.tsx   # Sales reps list
│   ├── app.reps.create.tsx   # Create rep form
│   ├── app.reps.$id.tsx      # Rep details
│   ├── app.territories._index.tsx  # Territories list
│   ├── app.territories.create.tsx  # Create territory
│   ├── app.territories.$id.tsx     # Territory details
│   ├── app.companies._index.tsx    # Companies list
│   ├── app.companies.$id.tsx       # Company details
│   ├── app.products._index.tsx     # Products management
│   ├── app.orders._index.tsx       # Orders list
│   ├── app.orders.$id.tsx          # Order details
│   └── webhooks.*.tsx              # Webhook handlers
├── services/                  # Business logic
│   ├── company.server.ts     # Company sync & management
│   ├── salesRep.server.ts    # Sales rep CRUD
│   ├── territory.server.ts   # Territory management
│   ├── order.server.ts       # Order operations
│   ├── webhook.server.ts     # Webhook processing
│   └── customer.server.ts    # Customer sync
├── components/               # Shared components
├── db.server.ts             # Prisma client
└── shopify.server.ts        # Shopify auth setup
```

## Key Features

### Sales Rep Management
- Create, update, delete sales reps
- Assign roles (Rep, Manager)
- Assign territories to reps

### Territory Management
- Define territories with names and descriptions
- Add zip codes or states to territories
- Auto-assign companies based on location

### Company Management
- Import companies from Shopify B2B
- View company details, contacts, locations
- Assign reps to companies
- Configure payment terms

### Product Management
- Sync products from Shopify
- Enable/disable products for field app
- Set inclusion tag for auto-enablement
- Bulk enable/disable actions

### Order Management
- View orders placed through field app
- Track order status
- Complete draft orders

## Webhooks

Registered in `shopify.app.toml`:

| Topic | Handler | Purpose |
|-------|---------|---------|
| `app/uninstalled` | `/webhooks/app/uninstalled` | Clean up on uninstall |
| `companies/create` | `/webhooks/companies` | Sync new companies |
| `companies/update` | `/webhooks/companies` | Update company data |
| `companies/delete` | `/webhooks/companies` | Mark company inactive |
| `company_locations/*` | `/webhooks/company-locations` | Sync locations |
| `products/create` | `/webhooks/products` | Sync new products |
| `products/update` | `/webhooks/products` | Update product data |
| `products/delete` | `/webhooks/products` | Remove products |

## Shopify Scopes

Required scopes (defined in `shopify.app.toml`):

- `read_customers` - Access customer data
- `read_companies` - Read B2B companies
- `write_companies` - Update company data
- `read_orders` - View orders
- `write_draft_orders` - Create orders
- `read_products` - Access product catalog

## Database Commands

```bash
npx prisma generate    # Generate client
npx prisma migrate dev # Run migrations
npx prisma studio      # Open DB browser
```

## Deployment

This app is part of a monorepo and should be built from the **repository root** to ensure dependencies are resolved correctly.

### Production Build (from monorepo root)

```bash
# From repository root
npm install
npm run build --workspace=apps/shopify-app
npm run setup --workspace=apps/shopify-app   # Prisma generate + migrate
npm run start --workspace=apps/shopify-app
```

### Render Deployment

See the root `render.yaml` for the full Blueprint configuration. This app is deployed as the `field-sales-shopify-app` service.

**Build command:**
```bash
npm install && npm run build --workspace=apps/shopify-app && npm run setup --workspace=apps/shopify-app
```

**Start command:**
```bash
npm run start --workspace=apps/shopify-app
```

**Required environment variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SHOPIFY_API_KEY` - From Shopify Partner Dashboard
- `SHOPIFY_API_SECRET` - From Shopify Partner Dashboard
- `SHOPIFY_APP_URL` - Public URL of the deployed app

### Deploy to Shopify

After deploying to your hosting provider, push your app configuration to Shopify:

```bash
shopify app deploy
```

This syncs webhook subscriptions, scopes, and other settings to Shopify.

## Development Tips

### Authentication

Use `authenticate.admin(request)` to get the admin context:

```typescript
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  // session.shop contains the shop domain
  // admin.graphql() makes authenticated API calls
};
```

### GraphQL Queries

```typescript
const response = await admin.graphql(`
  query {
    products(first: 10) {
      edges {
        node {
          id
          title
        }
      }
    }
  }
`);
const data = await response.json();
```

### Navigation

Always use React Router navigation to maintain the embedded app session:

```tsx
import { Link, useNavigate } from "react-router";

// Use Link component
<Link to="/app/reps/create">Add Rep</Link>

// Or useNavigate hook
const navigate = useNavigate();
navigate("/app/reps/123");
```

### Polaris Components

This app uses Shopify Polaris Web Components (s-* elements):

```tsx
<s-page heading="Sales Reps">
  <s-button slot="primary-action">Add Rep</s-button>
  <s-section>
    <s-table>
      <s-table-header-row>
        <s-table-header>Name</s-table-header>
      </s-table-header-row>
    </s-table>
  </s-section>
</s-page>
```

## Troubleshooting

### "Database tables don't exist"

Run the setup script:
```bash
npm run setup
```

### Webhooks not updating

Redeploy the app to sync webhook subscriptions:
```bash
shopify app deploy
```

### Session issues in embedded app

- Never use `<a>` tags, use `<Link>` from React Router
- Use `redirect` from `authenticate.admin`, not from React Router
