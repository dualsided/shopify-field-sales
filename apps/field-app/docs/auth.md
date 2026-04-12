# Authentication

Authentication and authorization in the Field Sales app.

## Overview

The app uses JWT-based authentication with phone number verification via Twilio Verify. Sessions are stored in cookies with refresh tokens for auto-renewal.

## Authentication Flow

### Phone/OTP Login (Production)

```
User enters phone → Send OTP via Twilio → User enters code → Verify with Twilio → JWT issued
                                                                      ↓
                                                              Stored in cookie
                                                                      ↓
                                                              Validated on each request
```

1. User enters phone number on login page
2. App sends OTP via Twilio Verify (`/api/auth/send-otp`)
3. User receives 6-digit code via SMS
4. User enters code
5. App verifies code with Twilio (`/api/auth/verify-otp`)
6. If valid, JWT access token and refresh token are issued
7. Tokens stored in HTTP-only cookies

### Dev Mode Login

In development, a "dev login" option allows selecting any sales rep without SMS verification for easy testing.

## API Endpoints

### Send OTP

```
POST /api/auth/send-otp
Body: { phone: "+15551234567" }
Response: { data: { sent: true }, error: null }
```

Sends a 6-digit verification code via SMS using Twilio Verify.

### Verify OTP

```
POST /api/auth/verify-otp
Body: { phone: "+15551234567", code: "123456" }
Response: {
  data: {
    accessToken: "...",
    refreshToken: "...",
    expiresIn: 3600,
    rep: { id, email, firstName, lastName, role }
  },
  error: null
}
```

Verifies the OTP code and issues JWT tokens on success.

### Logout

```
POST /api/auth/logout
```

Clears auth cookies.

### Refresh Token

```
POST /api/auth/refresh
```

Exchanges refresh token for new access token.

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

## Twilio Setup

### Environment Variables

```env
TWILIO_ACCOUNT_SID="ACxxxx..."
TWILIO_AUTH_TOKEN="xxxx..."
TWILIO_VERIFY_SERVICE_SID="VAxxxx..."
```

### Creating a Verify Service

1. Log in to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Verify** > **Services**
3. Click **Create new**
4. Name it (e.g., "Field Sales Manager")
5. Copy the **Service SID** to `TWILIO_VERIFY_SERVICE_SID`

### Phone Number Format

- Numbers are stored and sent in E.164 format: `+15551234567`
- US numbers without country code are auto-prefixed with `+1`
- Login page formats display as `(555) 123-4567`

## Data Model

### SalesRep

```typescript
{
  id: string;
  shopId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;           // Phone number for SMS auth
  role: RepRole;            // REP, MANAGER, ADMIN
  passwordHash?: string;    // Optional for password login
  isActive: boolean;
  repTerritories: RepTerritory[];
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth/index.ts` | Auth utilities, getAuthContext |
| `src/lib/auth/jwt.ts` | JWT token creation/verification |
| `src/lib/twilio/client.ts` | Twilio Verify client |
| `src/app/api/auth/send-otp/route.ts` | Send OTP endpoint |
| `src/app/api/auth/verify-otp/route.ts` | Verify OTP endpoint |
| `src/app/api/auth/login/route.ts` | Password login (optional) |
| `src/app/api/auth/logout/route.ts` | Logout endpoint |
| `src/app/api/auth/refresh/route.ts` | Token refresh |
| `src/app/(auth)/login/page.tsx` | Login page |

## Login Page Features

- Phone number input with auto-formatting
- 6-digit OTP input with auto-focus and paste support
- 60-second resend countdown
- "Change number" to go back
- Dev login toggle (development only)

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

## Security Considerations

- OTP codes expire after 10 minutes (Twilio default)
- Rate limiting handled by Twilio Verify
- Phone numbers are not confirmed to exist (prevents enumeration)
- HTTP-only cookies prevent XSS token theft
- CSRF protection via `sameSite: 'lax'` cookies
