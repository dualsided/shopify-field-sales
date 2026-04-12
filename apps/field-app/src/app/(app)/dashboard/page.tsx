'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClipboardList, Building2, Clock, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface DashboardMetrics {
  ordersThisMonth: number;
  orderChange: number;
  accountCount: number;
  pendingOrders: number;
}

interface OrderItem {
  id: string;
  orderNumber: string;
  shopifyOrderNumber: string | null;
  totalCents: number;
  currency: string;
  status: string;
  placedAt: string | null;
  createdAt: string;
  updatedAt: string;
  companyName: string;
}

interface LatestCompany {
  id: string;
  name: string;
  accountNumber: string | null;
  createdAt: string;
}

interface DashboardData {
  metrics: DashboardMetrics;
  orders: {
    draft: OrderItem[];
    awaitingReview: OrderItem[];
    placed: OrderItem[];
  };
  latestCompanies: LatestCompany[];
}

type OrderTab = 'draft' | 'awaitingReview' | 'placed';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrderTab, setActiveOrderTab] = useState<OrderTab>('draft');

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const { data: result } = await api.client.dashboard.stats();

        if (result) {
          setData(result as unknown as DashboardData);
        }
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  const formatPrice = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
      return `${diffDays}d ago`;
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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-4 h-4 text-primary-500" />
            <p className="text-sm text-gray-500">Orders</p>
          </div>
          <p className="text-2xl font-bold text-primary-600">
            {loading ? '--' : data?.metrics.ordersThisMonth || 0}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary-500" />
            <p className="text-sm text-gray-500">Companies</p>
          </div>
          <p className="text-2xl font-bold text-primary-600">
            {loading ? '--' : data?.metrics.accountCount || 0}
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-gray-500">Pending</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {loading ? '--' : data?.metrics.pendingOrders || 0}
          </p>
        </div>
      </div>

      {/* Orders Section with Tabs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Orders</h2>
          <Link href="/orders" className="text-sm link flex items-center gap-1">
            View All
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
          <button
            onClick={() => setActiveOrderTab('draft')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              activeOrderTab === 'draft'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Draft
            {data?.orders.draft.length ? (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-200">
                {data.orders.draft.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveOrderTab('awaitingReview')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              activeOrderTab === 'awaitingReview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Awaiting Review
            {data?.orders.awaitingReview.length ? (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">
                {data.orders.awaitingReview.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveOrderTab('placed')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              activeOrderTab === 'placed'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Placed
            {data?.orders.placed.length ? (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                {data.orders.placed.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* Order List */}
        <div className="space-y-3">
          {loading ? (
            <div className="card text-center py-6">
              <p className="text-gray-500 text-sm">Loading...</p>
            </div>
          ) : (() => {
            const orders = data?.orders[activeOrderTab] || [];
            if (orders.length === 0) {
              const emptyMessages: Record<OrderTab, { title: string; subtitle: string }> = {
                draft: { title: 'No draft orders', subtitle: 'Start a new order from an account' },
                awaitingReview: { title: 'No orders awaiting review', subtitle: 'Submitted orders appear here' },
                placed: { title: 'No placed orders', subtitle: 'Approved orders appear here' },
              };
              return (
                <div className="card text-center py-6">
                  <p className="text-gray-500 text-sm">{emptyMessages[activeOrderTab].title}</p>
                  <p className="text-xs text-gray-400 mt-1">{emptyMessages[activeOrderTab].subtitle}</p>
                </div>
              );
            }
            return orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="card-interactive flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{order.shopifyOrderNumber || order.orderNumber}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {order.companyName} • {formatDate(activeOrderTab === 'draft' ? order.updatedAt : (order.placedAt || order.createdAt))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatPrice(order.totalCents / 100, order.currency)}
                    </p>
                    <span className={getStatusBadge(order.status)}>
                      {order.status === 'AWAITING_REVIEW' ? 'In Review' : order.status || 'Pending'}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ));
          })()}
        </div>
      </section>

      {/* Latest Companies */}
      {!loading && data?.latestCompanies && data.latestCompanies.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Latest Companies</h2>
            <Link href="/companies" className="text-sm link flex items-center gap-1">
              View All
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {data.latestCompanies.map((company) => (
              <Link
                key={company.id}
                href={`/companies/${company.id}`}
                className="card-interactive flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{company.name}</p>
                    {company.accountNumber && (
                      <p className="text-xs text-gray-500">#{company.accountNumber}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">{formatDate(company.createdAt)}</p>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
