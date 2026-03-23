import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set - payment features will be disabled');
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    })
  : null;

/**
 * Create or retrieve a Stripe customer for a company
 */
export async function getOrCreateStripeCustomer(
  companyName: string,
  email?: string,
  metadata?: Record<string, string>
): Promise<string | null> {
  if (!stripe) return null;

  // Search for existing customer by metadata
  if (metadata?.shopifyCompanyId) {
    const existingCustomers = await stripe.customers.search({
      query: `metadata['shopifyCompanyId']:'${metadata.shopifyCompanyId}'`,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0].id;
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    name: companyName,
    email,
    metadata,
  });

  return customer.id;
}

/**
 * Create a Setup Intent for saving a payment method
 */
export async function createSetupIntent(
  customerId: string
): Promise<{ clientSecret: string; setupIntentId: string } | null> {
  if (!stripe) return null;

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session', // For recurring/future payments
  });

  return {
    clientSecret: setupIntent.client_secret!,
    setupIntentId: setupIntent.id,
  };
}

/**
 * Retrieve payment method details
 */
export async function getPaymentMethod(
  paymentMethodId: string
): Promise<Stripe.PaymentMethod | null> {
  if (!stripe) return null;

  try {
    return await stripe.paymentMethods.retrieve(paymentMethodId);
  } catch {
    return null;
  }
}

/**
 * List payment methods for a customer
 */
export async function listCustomerPaymentMethods(
  customerId: string
): Promise<Stripe.PaymentMethod[]> {
  if (!stripe) return [];

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  return paymentMethods.data;
}

/**
 * Detach a payment method from a customer
 */
export async function detachPaymentMethod(
  paymentMethodId: string
): Promise<boolean> {
  if (!stripe) return false;

  try {
    await stripe.paymentMethods.detach(paymentMethodId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a payment intent to charge a saved payment method
 */
export async function createPaymentIntent(
  customerId: string,
  paymentMethodId: string,
  amount: number, // In cents
  currency: string = 'usd',
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent | null> {
  if (!stripe) return null;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    metadata,
  });

  return paymentIntent;
}
