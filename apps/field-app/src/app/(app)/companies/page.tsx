'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Building2, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { CompanyListItem, TerritoryListItem, PaginatedResponse } from '@/types';

export default function CompaniesPage() {
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
        const { data } = await api.client.territories.list();
        if (data?.items) {
          setTerritories(data.items as TerritoryListItem[]);
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
      const { data } = await api.client.companies.list({
        page,
        pageSize: 20,
        query: searchQuery || undefined,
        territoryId: selectedTerritoryId || undefined,
      });

      if (data) {
        setCompanies(data.items as CompanyListItem[]);
        setPagination(data.pagination);
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
      {/* Search */}
      <div className="relative">
        <input
          type="search"
          placeholder="Search companies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input pl-10"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
            <p className="text-gray-500">No companies found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery || selectedTerritoryId
                ? 'Try adjusting your filters'
                : 'Companies will appear here once synced from Shopify'}
            </p>
          </div>
        ) : (
          companies.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.id}`}
              className="card-interactive flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{company.name}</p>
                <p className="text-sm text-gray-500 truncate">
                  {company.territoryName || 'No territory'}
                  {company.accountNumber && ` • #${company.accountNumber}`}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
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
