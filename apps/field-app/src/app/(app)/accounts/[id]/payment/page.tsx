'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';

interface PaymentMethod {
  id: string;
  provider: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  createdAt: string;
}

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (key) {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}

export default function PaymentPage() {
  const params = useParams();
  const id = params.id as string;
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${id}/payment-methods`);
      const data = await res.json();

      if (data.data) {
        setPaymentMethods(data.data);
      }
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  async function handleAddCard() {
    setShowAddForm(true);
    setError(null);

    try {
      // Load Stripe
      const stripeInstance = await getStripe();
      if (!stripeInstance) {
        setError('Payment processing not available');
        return;
      }
      setStripe(stripeInstance);

      // Get setup intent from server
      const res = await fetch(`/api/companies/${id}/payment-methods`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error.message);
        return;
      }

      setClientSecret(data.data.clientSecret);
      setCustomerId(data.data.customerId);

      // Create elements
      const elementsInstance = stripeInstance.elements({
        clientSecret: data.data.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#4f46e5',
            borderRadius: '8px',
          },
        },
      });
      setElements(elementsInstance);
    } catch (err) {
      console.error('Error setting up card form:', err);
      setError('Failed to setup card form');
    }
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !clientSecret || !customerId) return;

    setSaving(true);
    setError(null);

    try {
      // Confirm the setup intent
      const { setupIntent, error: stripeError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href, // Not used, we handle inline
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message || 'Card verification failed');
        setSaving(false);
        return;
      }

      if (!setupIntent || setupIntent.status !== 'succeeded') {
        setError('Card setup failed');
        setSaving(false);
        return;
      }

      // Save to our database
      const res = await fetch(`/api/companies/${id}/payment-methods`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: setupIntent.payment_method,
          customerId,
          setAsDefault: paymentMethods.length === 0,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error.message);
        setSaving(false);
        return;
      }

      // Reset and refresh
      setShowAddForm(false);
      setElements(null);
      setClientSecret(null);
      setCustomerId(null);
      fetchPaymentMethods();
    } catch (err) {
      console.error('Error saving card:', err);
      setError('Failed to save card');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCard(paymentMethodId: string) {
    if (!confirm('Remove this payment method?')) return;

    setDeleting(paymentMethodId);
    try {
      const res = await fetch(
        `/api/companies/${id}/payment-methods?paymentMethodId=${paymentMethodId}`,
        { method: 'DELETE' }
      );

      const data = await res.json();

      if (data.error) {
        alert(data.error.message);
        return;
      }

      fetchPaymentMethods();
    } catch (err) {
      console.error('Error deleting card:', err);
      alert('Failed to delete card');
    } finally {
      setDeleting(null);
    }
  }

  async function handleSetDefault(paymentMethodId: string) {
    try {
      const method = paymentMethods.find((m) => m.id === paymentMethodId);
      if (!method) return;

      // For now, delete and re-add as default (simplified)
      // In a full implementation, you'd have a separate endpoint for this
      alert('Setting default is not implemented yet');
    } catch (err) {
      console.error('Error setting default:', err);
    }
  }

  const getBrandIcon = (brand: string | null) => {
    const brandLower = (brand || '').toLowerCase();
    if (brandLower === 'visa') {
      return (
        <svg className="w-10 h-6" viewBox="0 0 40 24" fill="none">
          <rect width="40" height="24" rx="4" fill="#1A1F71" />
          <path d="M16.5 15.5L18 8.5H20L18.5 15.5H16.5Z" fill="white" />
          <path d="M24 8.5L22.5 12.5L22.3 11.5L21.5 9C21.5 9 21.4 8.5 20.7 8.5H17.5L17.4 8.7C17.4 8.7 18.2 8.9 19.1 9.4L21 15.5H23.2L26 8.5H24Z" fill="white" />
          <path d="M12 8.5L9.3 13.5L9 12L8.2 9C8.2 9 8.1 8.5 7.4 8.5H4L3.9 8.7C3.9 8.7 5 9 6 9.8L8.3 15.5H10.5L14.2 8.5H12Z" fill="white" />
          <path d="M27.5 15.5H25.5L26 13.5H28.5C28.8 13.5 29 13.3 29 13L30 8.5H32L30.5 14.5C30.3 15.2 29.8 15.5 29 15.5H27.5Z" fill="white" />
        </svg>
      );
    }
    if (brandLower === 'mastercard') {
      return (
        <svg className="w-10 h-6" viewBox="0 0 40 24" fill="none">
          <rect width="40" height="24" rx="4" fill="#000" />
          <circle cx="15" cy="12" r="7" fill="#EB001B" />
          <circle cx="25" cy="12" r="7" fill="#F79E1B" />
          <path d="M20 6.8C21.8 8.2 23 10.5 23 12C23 13.5 21.8 15.8 20 17.2C18.2 15.8 17 13.5 17 12C17 10.5 18.2 8.2 20 6.8Z" fill="#FF5F00" />
        </svg>
      );
    }
    if (brandLower === 'amex') {
      return (
        <svg className="w-10 h-6" viewBox="0 0 40 24" fill="none">
          <rect width="40" height="24" rx="4" fill="#006FCF" />
          <text x="8" y="15" fill="white" fontSize="8" fontWeight="bold">AMEX</text>
        </svg>
      );
    }
    return (
      <svg className="w-10 h-6" viewBox="0 0 40 24" fill="none">
        <rect width="40" height="24" rx="4" fill="#E5E7EB" />
        <rect x="6" y="8" width="28" height="2" rx="1" fill="#9CA3AF" />
        <rect x="6" y="14" width="16" height="2" rx="1" fill="#9CA3AF" />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/accounts/${id}`}
          className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Payment Methods</h1>
      </div>

      {/* Payment Methods List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Loading payment methods...</p>
          </div>
        ) : paymentMethods.length === 0 && !showAddForm ? (
          <div className="card text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-gray-500">No payment methods on file</p>
            <p className="text-sm text-gray-400 mt-1">
              Add a payment method to enable quick checkout
            </p>
          </div>
        ) : (
          paymentMethods.map((method) => (
            <div key={method.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getBrandIcon(method.brand)}
                <div>
                  <p className="font-medium text-gray-900 capitalize">
                    {method.brand || 'Card'} {method.last4 && `•••• ${method.last4}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {method.expiryMonth && method.expiryYear && (
                      <>Expires {method.expiryMonth}/{method.expiryYear}</>
                    )}
                    {method.isDefault && (
                      <span className="ml-2 text-primary-600 font-medium">Default</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!method.isDefault && (
                  <button
                    onClick={() => handleSetDefault(method.id)}
                    className="text-sm text-gray-500 px-2 py-1"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => handleDeleteCard(method.id)}
                  disabled={deleting === method.id}
                  className="text-sm text-red-500 px-2 py-1"
                >
                  {deleting === method.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Card Form */}
      {showAddForm && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Add Payment Method</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {elements ? (
            <form onSubmit={handleSaveCard} className="space-y-4">
              <div id="payment-element">
                <PaymentElement elements={elements} />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setElements(null);
                    setClientSecret(null);
                    setError(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? 'Saving...' : 'Save Card'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500">Loading payment form...</p>
            </div>
          )}
        </div>
      )}

      {/* Add Payment Method Button */}
      {!showAddForm && (
        <button
          onClick={handleAddCard}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Payment Method
        </button>
      )}
    </div>
  );
}

// Stripe Payment Element component
function PaymentElement({ elements }: { elements: StripeElements }) {
  useEffect(() => {
    const paymentElement = elements.create('payment');
    paymentElement.mount('#payment-element');

    return () => {
      paymentElement.unmount();
    };
  }, [elements]);

  return null;
}
