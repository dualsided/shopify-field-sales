/**
 * API Client Setup for Web (Next.js)
 *
 * This file configures the HTTP and API clients for the web environment.
 * Uses cookie-based auth (tokens sent automatically via cookies).
 */

import {
  createHttpClient,
  createApiClient,
  CookieTokenStorage,
  type HttpClient,
  type ApiClient,
} from '@field-sales/shared';

// Singleton instances
let httpClient: HttpClient | null = null;
let apiClient: ApiClient | null = null;

/**
 * Get the HTTP client instance
 * Uses relative URLs (Next.js handles routing to API routes)
 */
export function getHttpClient(): HttpClient {
  if (!httpClient) {
    httpClient = createHttpClient({
      baseUrl: '', // Relative URLs for Next.js
      tokenStorage: new CookieTokenStorage(),
      credentials: 'include', // Include cookies in requests
      defaultHeaders: {
        'Content-Type': 'application/json',
      },
    });
  }
  return httpClient;
}

/**
 * Get the API client instance
 * Provides typed methods for all API endpoints
 */
export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = createApiClient(getHttpClient());
  }
  return apiClient;
}

/**
 * Convenience export for direct import
 */
export const api = {
  get client() {
    return getApiClient();
  },
  get http() {
    return getHttpClient();
  },
};

// Re-export types for convenience
export type {
  HttpResponse,
  CompanySearchParams,
  CompanyDetailResponse,
  ContactListParams,
  ContactWithPaymentMethods,
  PaymentMethodInfo,
  LocationListParams,
  LocationWithPaymentTerms,
  ProductSearchParams,
  ApiProductVariant,
  ApiProductListItem,
  ApiPromotionListItem,
  ShippingMethod,
  OrderSearchParams,
  ApiOrderListItem,
  ApiOrderDetail,
  ApiOrderLineItem,
  ApiAppliedPromotion,
  TimelineEvent,
  CreateOrderRequest,
  UpdateOrderRequest,
  DashboardStats,
  ProfileResponse,
  TaxCalculationRequest,
  TaxCalculationResponse,
} from '@field-sales/shared';
