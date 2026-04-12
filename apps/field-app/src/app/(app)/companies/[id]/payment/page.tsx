'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface PaymentMethod {
  id: string;
  provider: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
}

export default function PaymentPage() {
  const params = useParams();
  const id = params.id as string;
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const { data } = await api.client.paymentMethods.list(id);

      if (data) {
        setPaymentMethods(data as PaymentMethod[]);
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

  async function handleDeleteCard(paymentMethodId: string) {
    if (!confirm('Remove this payment method?')) return;

    setDeleting(paymentMethodId);
    try {
      const { error: apiError } = await api.client.paymentMethods.delete(id, paymentMethodId);

      if (apiError) {
        alert(apiError.message);
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
          href={`/companies/${id}`}
          className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Payment Methods</h1>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Payment methods are managed through Shopify. Contact your administrator to add new payment methods.
        </p>
      </div>

      {/* Payment Methods List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Loading payment methods...</p>
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="card text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-gray-500">No payment methods on file</p>
            <p className="text-sm text-gray-400 mt-1">
              Contact your administrator to add a payment method
            </p>
          </div>
        ) : (
          paymentMethods.map((method) => (
            <div key={method.id} className="card">
              <div className="flex items-start justify-between">
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
                    {method.contactName && (
                      <p className="text-xs text-gray-400 mt-1">
                        {method.contactName}
                      </p>
                    )}
                  </div>
                </div>
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
    </div>
  );
}
