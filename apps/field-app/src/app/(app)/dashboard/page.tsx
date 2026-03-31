'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface QuotaProgress {
  hasQuota: boolean;
  targetCents: number | null;
  achievedCents: number;
  projectedCents: number;
  progressPercent: number;
  projectedPercent: number;
  remainingCents: number;
  daysRemaining: number;
  onPaceIndicator: 'ahead' | 'on_pace' | 'behind' | 'at_risk' | 'no_quota';
}

interface DashboardMetrics {
  ordersThisMonth: number;
  orderChange: number;
  revenue: number;
  revenueChange: number;
  accountCount: number;
  pendingOrders: number;
  quota: QuotaProgress | null;
}

interface RecentOrder {
  id: string;
  shopifyOrderNumber: string;
  orderTotal: string;
  currency: string;
  status: string;
  placedAt: string;
  territoryName: string | null;
}

interface DashboardData {
  metrics: DashboardMetrics;
  recentOrders: RecentOrder[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/dashboard');
        const result = await res.json();

        if (result.data) {
          setData(result.data);
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

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('fulfilled') || s.includes('paid')) return 'bg-green-100 text-green-700';
    if (s.includes('pending') || s.includes('partial')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('cancelled') || s.includes('refund')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const ChangeIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    return (
      <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(value)}%
      </span>
    );
  };

  const getPaceStyles = (indicator: string) => {
    switch (indicator) {
      case 'ahead':
        return { bg: 'bg-green-100', text: 'text-green-700', label: 'Ahead', progress: 'bg-green-500' };
      case 'on_pace':
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'On Pace', progress: 'bg-blue-500' };
      case 'behind':
        return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Behind', progress: 'bg-yellow-500' };
      case 'at_risk':
        return { bg: 'bg-red-100', text: 'text-red-700', label: 'At Risk', progress: 'bg-red-500' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'No Quota', progress: 'bg-gray-400' };
    }
  };

  const QuotaCard = ({ quota }: { quota: QuotaProgress }) => {
    if (!quota.hasQuota) {
      return (
        <div className="card">
          <p className="text-sm text-gray-500">Monthly Quota</p>
          <p className="text-lg font-medium text-gray-400 mt-1">No quota assigned</p>
        </div>
      );
    }

    const paceStyles = getPaceStyles(quota.onPaceIndicator);
    const progressWidth = Math.min(quota.progressPercent, 100);
    const projectedWidth = Math.min(quota.projectedPercent, 100);

    return (
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-500">Monthly Quota</p>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${paceStyles.bg} ${paceStyles.text}`}>
            {paceStyles.label}
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
          {/* Projected (lighter, behind achieved) */}
          <div
            className={`absolute inset-y-0 left-0 ${paceStyles.progress} opacity-30 rounded-full`}
            style={{ width: `${projectedWidth}%` }}
          />
          {/* Achieved (solid) */}
          <div
            className={`absolute inset-y-0 left-0 ${paceStyles.progress} rounded-full`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-gray-500">Target</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatPrice(quota.targetCents! / 100)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Achieved</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatPrice(quota.achievedCents / 100)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Remaining</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatPrice(quota.remainingCents / 100)}
            </p>
          </div>
        </div>

        {/* Progress percentage and days remaining */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm font-medium text-gray-900">
            {quota.progressPercent}% achieved
          </span>
          <span className="text-xs text-gray-500">
            {quota.daysRemaining} days left
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Orders This Month</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900">
              {loading ? '--' : data?.metrics.ordersThisMonth || 0}
            </p>
            {data && <ChangeIndicator value={data.metrics.orderChange} />}
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Revenue</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900">
              {loading ? '$--' : formatPrice(data?.metrics.revenue || 0)}
            </p>
            {data && <ChangeIndicator value={data.metrics.revenueChange} />}
          </div>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Accounts</p>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? '--' : data?.metrics.accountCount || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Pending Orders</p>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? '--' : data?.metrics.pendingOrders || 0}
          </p>
        </div>
      </div>

      {/* Quota Progress */}
      {!loading && data?.metrics.quota && (
        <QuotaCard quota={data.metrics.quota} />
      )}

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/accounts" className="card flex flex-col items-center justify-center py-6 hover:shadow-md transition-shadow">
            <svg className="w-8 h-8 text-primary-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="font-medium text-gray-900">Accounts</span>
          </Link>
          <Link href="/orders" className="card flex flex-col items-center justify-center py-6 hover:shadow-md transition-shadow">
            <svg className="w-8 h-8 text-primary-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className="font-medium text-gray-900">Orders</span>
          </Link>
        </div>
      </section>

      {/* Recent Orders */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/orders" className="text-sm text-primary-600 font-medium">
            View All
          </Link>
        </div>
        <div className="space-y-3">
          {loading ? (
            <div className="card text-center py-6">
              <p className="text-gray-500 text-sm">Loading...</p>
            </div>
          ) : !data?.recentOrders.length ? (
            <div className="card text-center py-6">
              <p className="text-gray-500 text-sm">No recent orders</p>
              <p className="text-xs text-gray-400 mt-1">
                Orders will appear here after placement
              </p>
            </div>
          ) : (
            data.recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="card flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-medium text-gray-900">{order.shopifyOrderNumber}</p>
                  <p className="text-xs text-gray-500">
                    {order.territoryName || 'No territory'} • {formatDate(order.placedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: order.currency,
                    }).format(parseFloat(order.orderTotal))}
                  </p>
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                    {order.status || 'Pending'}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
