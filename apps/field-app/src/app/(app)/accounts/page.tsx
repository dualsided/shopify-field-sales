'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { CompanyListItem, TerritoryListItem, PaginatedResponse } from '@/types';

export default function AccountsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>('');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [territories, setTerritories] = useState<TerritoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginatedResponse<CompanyListItem>['pagination'] | null>(null);

  // Fetch territories for filter dropdown
  useEffect(() => {
    async function fetchTerritories() {
      try {
        const res = await fetch('/api/territories');
        const data = await res.json();
        if (data.data?.items) {
          setTerritories(data.data.items);
        }
      } catch (error) {
        console.error('Error fetching territories:', error);
      }
    }
    fetchTerritories();
  }, []);

  // Fetch companies with filters
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
      });

      if (searchQuery) {
        params.set('query', searchQuery);
      }
      if (selectedTerritoryId) {
        params.set('territoryId', selectedTerritoryId);
      }

      const res = await fetch(`/api/companies?${params}`);
      const data = await res.json();

      if (data.data) {
        setCompanies(data.data.items);
        setPagination(data.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, selectedTerritoryId]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedTerritoryId]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>

      {/* Search */}
      <div className="relative">
        <input
          type="search"
          placeholder="Search accounts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input pl-10"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Territory Filter */}
      {territories.length > 0 && (
        <select
          value={selectedTerritoryId}
          onChange={(e) => setSelectedTerritoryId(e.target.value)}
          className="input"
        >
          <option value="">All Territories</option>
          {territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {/* Company List */}
      <div className="space-y-3">
        {loading ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No accounts found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery || selectedTerritoryId
                ? 'Try adjusting your filters'
                : 'Accounts will appear here once synced from Shopify'}
            </p>
          </div>
        ) : (
          companies.map((company) => (
            <Link
              key={company.id}
              href={`/accounts/${company.id}`}
              className="card flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-gray-900">{company.name}</p>
                <p className="text-sm text-gray-500">
                  {company.territoryName || 'No territory'}
                  {company.accountNumber && ` • #${company.accountNumber}`}
                </p>
                {company.assignedRepName && (
                  <p className="text-xs text-gray-400">{company.assignedRepName}</p>
                )}
              </div>
              <svg
                className="w-5 h-5 text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setPage(page - 1)}
            disabled={!pagination.hasPreviousPage}
            className="btn-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!pagination.hasNextPage}
            className="btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
