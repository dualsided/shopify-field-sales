'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type StatusFilter = 'all' | 'pending' | 'paid' | 'fulfilled';

interface OrderListItem {
  id: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  shopifyCompanyId: string;
  orderTotal: string;
  currency: string;
  status: string;
  placedAt: string;
  repName: string;
  territoryName: string | null;
}

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
      });

      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();

      if (data.data) {
        setOrders(data.data.items);
        setHasMore(data.data.pagination.hasNextPage);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const formatPrice = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(date);
    }
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('fulfilled') || s.includes('paid')) return 'bg-green-100 text-green-700';
    if (s.includes('pending') || s.includes('partial')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('cancelled') || s.includes('refund')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  // Filter orders by status (client-side for now)
  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'all') return true;
    const s = order.status.toLowerCase();
    if (statusFilter === 'pending') return s.includes('pending') || s === '';
    if (statusFilter === 'paid') return s.includes('paid');
    if (statusFilter === 'fulfilled') return s.includes('fulfilled');
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Orders</h1>

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {(['all', 'pending', 'paid', 'fulfilled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Order List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No orders found</p>
            <p className="text-sm text-gray-400 mt-1">
              {statusFilter !== 'all'
                ? 'Try a different filter'
                : 'Orders will appear here after placement'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="card block hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900">{order.shopifyOrderNumber}</p>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                  {order.status || 'Pending'}
                </span>
              </div>
              {order.territoryName && (
                <p className="text-sm text-gray-600">{order.territoryName}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <p className="font-medium text-gray-900">
                  {formatPrice(order.orderTotal, order.currency)}
                </p>
                <p className="text-xs text-gray-400">{formatDate(order.placedAt)}</p>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Load More */}
      {hasMore && !loading && (
        <button
          onClick={() => setPage(page + 1)}
          className="btn-secondary w-full"
        >
          Load More
        </button>
      )}
    </div>
  );
}
