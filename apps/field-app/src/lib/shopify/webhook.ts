import crypto from 'crypto';

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';

export interface WebhookVerificationResult {
  valid: boolean;
  shop?: string;
  topic?: string;
  rawBody?: string;
}

/**
 * Verify Shopify webhook HMAC signature
 */
export function verifyWebhookSignature(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader || !SHOPIFY_API_SECRET) {
    return false;
  }

  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(generatedHash),
    Buffer.from(hmacHeader)
  );
}

/**
 * Extract and verify webhook headers
 */
export async function verifyWebhook(request: Request): Promise<WebhookVerificationResult> {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
  const shop = request.headers.get('x-shopify-shop-domain');
  const topic = request.headers.get('x-shopify-topic');

  const rawBody = await request.text();

  const valid = verifyWebhookSignature(rawBody, hmacHeader);

  return {
    valid,
    shop: shop || undefined,
    topic: topic || undefined,
    rawBody,
  };
}

/**
 * Parse webhook body after verification
 */
export function parseWebhookBody<T>(rawBody: string): T | null {
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return null;
  }
}
