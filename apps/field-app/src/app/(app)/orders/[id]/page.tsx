'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface OrderLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  imageUrl: string | null;
}

interface OrderDetail {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyCompanyId: string;
  orderTotal: string;
  currency: string;
  status: string;
  placedAt: string;
  rep: { name: string; email: string };
  territory: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  subtotal: string | null;
  tax: string | null;
  shipping: string | null;
  total: string;
  note: string | null;
  shippingAddress: {
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    provinceCode: string;
    zip: string;
  } | null;
  lineItems: OrderLineItem[];
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error.message);
        } else {
          setOrder(data.data);
        }
      } catch (err) {
        setError('Failed to load order');
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [id]);

  const formatPrice = (amount: string | null, currency: string = 'USD') => {
    if (!amount) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-600';
    const s = status.toLowerCase();
    if (s.includes('paid') || s.includes('fulfilled')) return 'bg-green-100 text-green-700';
    if (s.includes('pending') || s.includes('partial')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('refund') || s.includes('cancelled')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Loading...</h1>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Error</h1>
        </div>
        <div className="card text-center py-8">
          <p className="text-red-500">{error || 'Order not found'}</p>
          <Link href="/orders" className="btn-secondary mt-4 inline-block">
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/orders" className="min-w-touch min-h-touch flex items-center justify-center -ml-2">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{order.shopifyOrderNumber}</h1>
          <p className="text-sm text-gray-500">{formatDate(order.placedAt)}</p>
        </div>
      </div>

      {/* Status */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Status</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Payment</p>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.financialStatus)}`}>
              {order.financialStatus || 'Pending'}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Fulfillment</p>
            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.fulfillmentStatus)}`}>
              {order.fulfillmentStatus || 'Unfulfilled'}
            </span>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Items ({order.lineItems.length})</h2>
        {order.lineItems.length === 0 ? (
          <p className="text-sm text-gray-500">No items</p>
        ) : (
          <div className="space-y-3">
            {order.lineItems.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{item.title}</p>
                  {item.variantTitle && (
                    <p className="text-xs text-gray-500">{item.variantTitle}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {formatPrice(item.price, order.currency)} × {item.quantity}
                  </p>
                </div>
                <p className="font-medium text-gray-900 text-sm">
                  {formatPrice((parseFloat(item.price) * item.quantity).toString(), order.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal</span>
            <span>{formatPrice(order.subtotal, order.currency)}</span>
          </div>
          {order.shipping && parseFloat(order.shipping) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping</span>
              <span>{formatPrice(order.shipping, order.currency)}</span>
            </div>
          )}
          {order.tax && parseFloat(order.tax) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span>{formatPrice(order.tax, order.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-lg text-gray-900">
              {formatPrice(order.total, order.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      {order.shippingAddress && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Shipping Address</h2>
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900">{order.shippingAddress.name}</p>
            <p>{order.shippingAddress.address1}</p>
            {order.shippingAddress.address2 && <p>{order.shippingAddress.address2}</p>}
            <p>
              {order.shippingAddress.city}, {order.shippingAddress.provinceCode} {order.shippingAddress.zip}
            </p>
          </div>
        </div>
      )}

      {/* Order Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Order Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Placed by</span>
            <span>{order.rep.name}</span>
          </div>
          {order.territory && (
            <div className="flex justify-between">
              <span className="text-gray-500">Territory</span>
              <span>{order.territory}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Order ID</span>
            <span className="font-mono text-xs">{order.shopifyOrderId.split('/').pop()}</span>
          </div>
        </div>
        {order.note && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Note</p>
            <p className="text-sm text-gray-600">{order.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
