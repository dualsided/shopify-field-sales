'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, User, MapPin, Phone, Mail, Plus, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface OrderListItem {
  id: string;
  orderNumber: string;
  shopifyOrderNumber: string | null;
  totalCents: number;
  currency: string;
  status: string;
  placedAt: string | null;
  createdAt: string;
}

interface CompanyContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

interface CompanyLocation {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string;
  phone: string | null;
  isPrimary: boolean;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
}

interface CompanyWithDetails {
  id: string;
  shopId: string;
  shopifyCompanyId: string | null;
  name: string;
  accountNumber: string | null;
  paymentTerms: string;
  territoryId: string | null;
  assignedRepId: string | null;
  syncStatus: string;
  lastSyncedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  territory?: { name: string } | null;
  assignedRep?: { firstName: string; lastName: string } | null;
  contacts: CompanyContact[];
  locations: CompanyLocation[];
}

export default function CompanyDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<CompanyWithDetails | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [companyResult, ordersResult] = await Promise.all([
          api.client.companies.get(id),
          api.client.orders.list({ companyId: id, pageSize: 5 }),
        ]);

        if (companyResult.error) {
          setError(companyResult.error.message);
        } else {
          setCompany(companyResult.data as unknown as CompanyWithDetails);
        }

        if (ordersResult.data) {
          setOrders(ordersResult.data.items as unknown as OrderListItem[]);
        }
      } catch (err) {
        setError('Failed to load company');
        console.error('Error fetching company:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

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

  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatAddress = (location: CompanyLocation) => {
    const parts = [location.address1];
    if (location.address2) parts.push(location.address2);
    const cityState = [location.city, location.provinceCode || location.province, location.zipcode]
      .filter(Boolean)
      .join(', ');
    if (cityState) parts.push(cityState);
    return parts.join('\n');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/companies"
            className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Loading...</h1>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/companies"
            className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Error</h1>
        </div>
        <div className="card text-center py-8">
          <p className="text-red-500">{error || 'Company not found'}</p>
          <Link href="/companies" className="btn-secondary mt-4 inline-block">
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link
          href="/companies"
          className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-500">
            {company.accountNumber && <span className="font-medium">#{company.accountNumber}</span>}
            {company.accountNumber && company.territory && ' • '}
            {company.territory && company.territory.name}
          </p>
        </div>
      </div>

      {/* Company Info
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Company Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Payment Terms</span>
            <span className="text-gray-900">{company.paymentTerms.replace('_', ' ')}</span>
          </div>
          {company.territory && (
            <div className="flex justify-between">
              <span className="text-gray-500">Territory</span>
              <span className="text-gray-900">{company.territory.name}</span>
            </div>
          )}
          {company.assignedRep && (
            <div className="flex justify-between">
              <span className="text-gray-500">Assigned Rep</span>
              <span className="text-gray-900">
                {company.assignedRep.firstName} {company.assignedRep.lastName}
              </span>
            </div>
          )}
        </div>
      </section>
       */}

      {/* Recent Orders */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <Link
            href={`/orders/create?companyId=${id}`}
            className="text-sm text-primary-600 font-medium flex items-center gap-1 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Create Order
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {order.shopifyOrderNumber || order.orderNumber}
                    </p>
                    <span className={getStatusBadge(order.status)}>
                      {formatStatus(order.status)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDate(order.placedAt || order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {formatPrice(order.totalCents, order.currency)}
                  </p>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Contacts */}
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Contacts</h2>
        {company.contacts.length === 0 ? (
          <p className="text-sm text-gray-500">No contacts on file</p>
        ) : (
          <div className="space-y-3">
            {company.contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {contact.firstName} {contact.lastName}
                    </p>
                    {contact.isPrimary && (
                      <span className="badge bg-primary-100 text-primary-700">Primary</span>
                    )}
                  </div>
                  {contact.title && (
                    <p className="text-sm text-gray-500">{contact.title}</p>
                  )}
                  <div className="flex flex-col gap-1 mt-2">
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600"
                    >
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600"
                      >
                        <Phone className="w-4 h-4" />
                        <span>{contact.phone}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Locations */}
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Locations</h2>
        {company.locations.length === 0 ? (
          <p className="text-sm text-gray-500">No locations on file</p>
        ) : (
          <div className="space-y-3">
            {company.locations.map((location) => (
              <div
                key={location.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900">{location.name}</p>
                    {location.isPrimary && (
                      <span className="badge bg-primary-100 text-primary-700">Primary</span>
                    )}
                    {location.isShippingAddress && (
                      <span className="badge bg-green-100 text-green-700">Shipping</span>
                    )}
                    {location.isBillingAddress && (
                      <span className="badge bg-blue-100 text-blue-700">Billing</span>
                    )}
                  </div>
                  {location.address1 && (
                    <p className="text-sm text-gray-600 whitespace-pre-line mt-1">
                      {formatAddress(location)}
                    </p>
                  )}
                  {location.phone && (
                    <a
                      href={`tel:${location.phone}`}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mt-2"
                    >
                      <Phone className="w-4 h-4" />
                      <span>{location.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
