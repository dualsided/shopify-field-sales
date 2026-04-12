/**
 * HTTP Client
 *
 * Platform-agnostic HTTP client that works in both web and React Native.
 * Uses fetch API which is available in both environments.
 */

import type { TokenStorage } from './tokenStorage';

export interface HttpClientConfig {
  /**
   * Base URL for API requests
   * Web: '' (relative URLs)
   * React Native: 'https://api.example.com'
   */
  baseUrl: string;

  /**
   * Token storage implementation
   */
  tokenStorage?: TokenStorage;

  /**
   * Default headers to include in all requests
   */
  defaultHeaders?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Credentials mode for fetch
   * Web: 'include' for cookies
   * React Native: 'omit' (uses token header instead)
   */
  credentials?: 'omit' | 'same-origin' | 'include';
}

export interface HttpResponse<T> {
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  status: number;
  ok: boolean;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

export class HttpClient {
  private config: Required<Omit<HttpClientConfig, 'tokenStorage'>> & {
    tokenStorage?: TokenStorage;
  };

  constructor(config: HttpClientConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      tokenStorage: config.tokenStorage,
      defaultHeaders: config.defaultHeaders ?? {
        'Content-Type': 'application/json',
      },
      timeout: config.timeout ?? 30000,
      credentials: config.credentials ?? 'include',
    };
  }

  /**
   * Build full URL from path
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    // For relative URLs (web), just append params to path
    // For absolute URLs (React Native), use URL constructor
    const baseUrl = this.config.baseUrl || 'http://localhost';
    const url = new URL(path, baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    // Return full URL for React Native, relative for web
    return this.config.baseUrl ? url.toString() : `${url.pathname}${url.search}`;
  }

  /**
   * Get auth headers from token storage
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.config.tokenStorage) {
      return {};
    }

    const headers: Record<string, string> = {};

    const token = await this.config.tokenStorage.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const additionalHeaders = await this.config.tokenStorage.getAuthHeaders?.();
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }

    return headers;
  }

  /**
   * Make HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeout = options?.timeout ?? this.config.timeout;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const authHeaders = await this.getAuthHeaders();

      const response = await fetch(this.buildUrl(path), {
        method,
        headers: {
          ...this.config.defaultHeaders,
          ...authHeaders,
          ...options?.headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: this.config.credentials,
        signal: options?.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        if (!response.ok) {
          return {
            data: null,
            error: {
              code: 'HTTP_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
            },
            status: response.status,
            ok: false,
          };
        }
        return {
          data: null,
          error: null,
          status: response.status,
          ok: true,
        };
      }

      const json = (await response.json()) as Record<string, unknown>;

      // API returns { data, error } format
      if ('data' in json || 'error' in json) {
        return {
          data: (json.data as T) ?? null,
          error: (json.error as HttpResponse<T>['error']) ?? null,
          status: response.status,
          ok: response.ok && !json.error,
        };
      }

      // Raw response (shouldn't happen with our API convention)
      return {
        data: json as T,
        error: null,
        status: response.status,
        ok: response.ok,
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') {
        return {
          data: null,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out',
          },
          status: 0,
          ok: false,
        };
      }

      return {
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network error',
        },
        status: 0,
        ok: false,
      };
    }
  }

  /**
   * GET request
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const url = params ? this.buildUrl(path, params) : path;
    return this.request<T>('GET', url, undefined, options);
  }

  /**
   * POST request
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * PUT request
   */
  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * PATCH request
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * DELETE request
   */
  async delete<T>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * Update configuration (e.g., after login)
   */
  setConfig(config: Partial<HttpClientConfig>): void {
    if (config.baseUrl !== undefined) this.config.baseUrl = config.baseUrl;
    if (config.tokenStorage !== undefined) this.config.tokenStorage = config.tokenStorage;
    if (config.defaultHeaders) {
      this.config.defaultHeaders = { ...this.config.defaultHeaders, ...config.defaultHeaders };
    }
    if (config.timeout !== undefined) this.config.timeout = config.timeout;
    if (config.credentials !== undefined) this.config.credentials = config.credentials;
  }
}

/**
 * Create a configured HTTP client
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClient(config);
}
