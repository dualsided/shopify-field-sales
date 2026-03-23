'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Company } from '@/types';

interface CompanyWithDetails extends Company {
  territory?: { name: string } | null;
  assignedRep?: { firstName: string; lastName: string } | null;
}

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [company, setCompany] = useState<CompanyWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch(`/api/companies/${id}`);
        const data = await res.json();

        if (data.error) {
          setError(data.error.message);
        } else {
          setCompany(data.data);
        }
      } catch (err) {
        setError('Failed to load company');
        console.error('Error fetching company:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCompany();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/accounts"
            className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Loading...</h1>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/accounts"
            className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Error</h1>
        </div>
        <div className="card text-center py-8">
          <p className="text-red-500">{error || 'Company not found'}</p>
          <Link href="/accounts" className="btn-secondary mt-4 inline-block">
            Back to Accounts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/accounts"
          className="min-w-touch min-h-touch flex items-center justify-center -ml-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
          {company.territory && (
            <p className="text-sm text-gray-500">{company.territory.name}</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/accounts/${id}/order`} className="btn-primary text-center">
          New Order
        </Link>
        <Link href={`/accounts/${id}/payment`} className="btn-secondary text-center">
          Payment
        </Link>
      </div>

      {/* Company Info */}
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Company Info</h2>
        <div className="space-y-2 text-sm">
          {company.shopifyCompanyId && (
            <div className="flex justify-between">
              <span className="text-gray-500">Shopify ID</span>
              <span className="text-gray-900 font-mono text-xs">
                {company.shopifyCompanyId.split('/').pop()}
              </span>
            </div>
          )}
          {company.accountNumber && (
            <div className="flex justify-between">
              <span className="text-gray-500">Account #</span>
              <span className="text-gray-900">{company.accountNumber}</span>
            </div>
          )}
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
          <div className="flex justify-between">
            <span className="text-gray-500">Sync Status</span>
            <span className={`${
              company.syncStatus === 'SYNCED' ? 'text-green-600' :
              company.syncStatus === 'PENDING' ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {company.syncStatus}
            </span>
          </div>
          {company.lastSyncedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">Last Synced</span>
              <span className="text-gray-900">
                {new Date(company.lastSyncedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Recent Orders */}
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Recent Orders</h2>
        <p className="text-sm text-gray-500">No orders yet</p>
      </section>

      {/* Payment Methods */}
      <section className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Payment Methods</h2>
        <p className="text-sm text-gray-500">No payment methods on file</p>
        <Link
          href={`/accounts/${id}/payment`}
          className="text-primary-600 text-sm font-medium mt-2 inline-block"
        >
          Add Payment Method
        </Link>
      </section>
    </div>
  );
}
