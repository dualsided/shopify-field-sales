'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';

type StatusFilter = 'all' | 'DRAFT' | 'AWAITING_REVIEW' | 'PENDING' | 'PAID' | 'REFUNDED';

interface OrderListItem {
  id: string;
  orderNumber: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  companyId: string;
  companyName: string;
  contactName: string | null;
  locationAddress: string | null;
  totalCents: number;
  currency: string;
  status: string;
  placedAt: string | null;
  createdAt: string;
  repName: string;
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
      const { data } = await api.client.orders.list({
        page,
        pageSize: 20,
      });

      if (data) {
        setOrders(data.items as unknown as OrderListItem[]);
        setHasMore(data.pagination.hasNextPage);
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

  const formatPrice = (cents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
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

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('draft')) return 'badge-draft';
    if (s.includes('awaiting')) return 'badge-awaiting';
    if (s.includes('fulfilled') || s.includes('paid')) return 'badge-paid';
    if (s.includes('pending')) return 'badge-pending';
    if (s.includes('cancelled') || s.includes('refund')) return 'badge-cancelled';
    return 'badge-default';
  };

  const formatStatus = (status: string) => {
    // Convert AWAITING_REVIEW to "Awaiting Review", DRAFT to "Draft", etc.
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Filter orders by status (client-side for now)
  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'all') return true;
    return order.status === statusFilter;
  });

  // Filter labels for display
  const filterLabels: Record<StatusFilter, string> = {
    all: 'All',
    DRAFT: 'Draft',
    AWAITING_REVIEW: 'In Review',
    PENDING: 'Pending',
    PAID: 'Paid',
    REFUNDED: 'Refunded',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/orders/create" className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          New Order
        </Link>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {(['all', 'DRAFT', 'AWAITING_REVIEW', 'PENDING', 'PAID', 'REFUNDED'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filterLabels[status]}
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
              className="card-interactive flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                {/* Header: Order number and status */}
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900">
                    {order.shopifyOrderNumber || order.orderNumber}
                  </p>
                  <span className={getStatusBadge(order.status)}>
                    {formatStatus(order.status) || 'Draft'}
                  </span>
                </div>

                {/* Company and Contact */}
                <p className="text-sm font-medium text-gray-700 truncate">{order.companyName}</p>

                {/* Total and Date */}
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatPrice(order.totalCents, order.currency)}
                  </p>
                  <span className="text-gray-300">•</span>
                  <p className="text-xs text-gray-500">
                    {formatDate(order.placedAt || order.createdAt)}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
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
