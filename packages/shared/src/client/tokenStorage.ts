/**
 * Token Storage Interface
 *
 * Platform-agnostic interface for storing authentication tokens.
 * Implementations:
 * - Web: localStorage or cookies
 * - React Native: AsyncStorage or SecureStore
 */

export interface TokenStorage {
  /**
   * Get the current auth token
   */
  getToken(): Promise<string | null>;

  /**
   * Store an auth token
   */
  setToken(token: string): Promise<void>;

  /**
   * Clear the auth token (logout)
   */
  clearToken(): Promise<void>;

  /**
   * Get additional auth headers if needed
   * (e.g., shop domain header)
   */
  getAuthHeaders?(): Promise<Record<string, string>>;
}

/**
 * In-memory token storage for testing or SSR
 */
export class MemoryTokenStorage implements TokenStorage {
  private token: string | null = null;

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
  }

  async clearToken(): Promise<void> {
    this.token = null;
  }
}

/**
 * No-op token storage for cookie-based auth
 * where tokens are automatically sent via cookies
 */
export class CookieTokenStorage implements TokenStorage {
  async getToken(): Promise<string | null> {
    // Cookies are sent automatically by the browser
    return null;
  }

  async setToken(): Promise<void> {
    // Cookies are set by the server
  }

  async clearToken(): Promise<void> {
    // Logout is handled by server clearing cookies
  }
}
