import { headers } from 'next/headers';
import type { RepRole } from '@field-sales/shared';

export interface AuthContext {
  shopId: string;
  repId: string;
  role: RepRole;
}

/**
 * Get the authenticated user context from request headers.
 * This should only be called in API routes/server components that are
 * protected by the middleware.
 *
 * @throws Error if auth headers are missing (should never happen for protected routes)
 */
export async function getAuthContext(): Promise<AuthContext> {
  const headersList = await headers();

  const shopId = headersList.get('x-shop-id');
  const repId = headersList.get('x-rep-id');
  const role = headersList.get('x-rep-role') as RepRole;

  if (!shopId || !repId || !role) {
    throw new Error('Auth context not found in headers. Is this route protected by middleware?');
  }

  return { shopId, repId, role };
}

/**
 * Check if the current user has one of the specified roles.
 */
export async function requireRole(...allowedRoles: RepRole[]): Promise<AuthContext> {
  const context = await getAuthContext();

  if (!allowedRoles.includes(context.role)) {
    throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
  }

  return context;
}
