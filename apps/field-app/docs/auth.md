# Authentication

Authentication and authorization in the Field Sales app.

## Overview

The app uses JWT-based authentication with refresh tokens. Sessions are stored in Redis for fast validation.

## Authentication Flow

```
Login → JWT issued → Stored in cookie → Validated on each request
                         ↓
                    Refresh token in Redis
                         ↓
                    Auto-refresh before expiry
```

## Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `REP` | Sales representative | Own territories, own orders |
| `MANAGER` | Sales manager | All territories, team orders |
| `ADMIN` | Administrator | Full access |

## Multi-Tenancy

Every request is scoped to a `shopId` (Shopify store):
- Extracted from JWT claims
- Required filter on all database queries
- Prevents cross-tenant data access

## Auth Context

```typescript
import { getAuthContext } from '@/lib/auth';

export async function GET(request: Request) {
  const { shopId, repId, role } = await getAuthContext();

  // Use in queries
  const data = await prisma.order.findMany({
    where: {
      shopId,
      ...(role === 'REP' && { salesRepId: repId }),
    },
  });
}
```

## Data Model

### SalesRep
```typescript
{
  id: string;
  shopId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: RepRole;                // REP, MANAGER, ADMIN
  passwordHash: string;
  isActive: boolean;
  repTerritories: RepTerritory[];
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth/index.ts` | Auth utilities, getAuthContext |
| `src/lib/redis/index.ts` | Redis session storage |
| `src/app/api/auth/login/route.ts` | Login endpoint |
| `src/app/api/auth/logout/route.ts` | Logout endpoint |
| `src/app/api/auth/refresh/route.ts` | Token refresh |
| `src/app/login/page.tsx` | Login page |

## Territory-Based Access

Reps only see data in their assigned territories:

```typescript
// Get rep's territory IDs
const repTerritories = await prisma.repTerritory.findMany({
  where: { repId },
  select: { territoryId: true },
});

// Filter companies by territory
const companies = await prisma.company.findMany({
  where: {
    shopId,
    territoryId: { in: repTerritories.map(t => t.territoryId) },
  },
});
```

## Dev Mode

In development, `/login` shows a rep selector without password requirement for easy testing.
