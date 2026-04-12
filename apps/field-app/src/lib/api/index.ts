/**
 * API Client Module
 *
 * Provides a typed API client for making requests to the field-app API.
 *
 * Usage:
 * ```typescript
 * import { api } from '@/lib/api';
 *
 * // Fetch companies
 * const { data, error } = await api.client.companies.list({ query: 'acme' });
 *
 * // Fetch orders
 * const { data, error } = await api.client.orders.list({ status: 'DRAFT' });
 *
 * // Create order
 * const { data, error } = await api.client.orders.create({
 *   companyId: '...',
 *   lineItems: [{ shopifyVariantId: '...', quantity: 1 }],
 * });
 * ```
 */

export { api, getApiClient, getHttpClient } from './client';
export type * from './client';
