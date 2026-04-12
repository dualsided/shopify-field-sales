'use client';

import { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { api } from '@/lib/api';

export interface CompanyOption {
  id: string;
  name: string;
  accountNumber: string | null;
  territoryName?: string | null;
}

interface CompanyPickerProps {
  selected: CompanyOption | null;
  onSelect: (company: CompanyOption | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

interface CompanyListItem {
  id: string;
  name: string;
  accountNumber: string | null;
  territoryName: string | null;
}

export function CompanyPicker({
  selected,
  onSelect,
  disabled = false,
  label = 'Company',
  placeholder = 'Select a company...',
}: CompanyPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCompanies = useCallback(async (query: string = '') => {
    setLoading(true);
    try {
      const { data } = await api.client.companies.list({
        pageSize: 50,
        query: query || undefined,
      });

      if (data?.items) {
        setCompanies(data.items as CompanyListItem[]);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load companies when sheet opens
  useEffect(() => {
    if (isOpen) {
      fetchCompanies(searchQuery);
    }
  }, [isOpen, fetchCompanies, searchQuery]);

  const handleSelect = (company: CompanyListItem) => {
    onSelect({
      id: company.id,
      name: company.name,
      accountNumber: company.accountNumber,
      territoryName: company.territoryName,
    });
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onSelect(null);
  };

  return (
    <>
      <div>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}

        {selected ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !disabled && setIsOpen(true)}
              disabled={disabled}
              className="flex-1 input text-left flex items-center justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{selected.name}</p>
                {selected.accountNumber && (
                  <p className="text-sm text-gray-500 truncate">
                    Account: {selected.accountNumber}
                  </p>
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
                  d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                />
              </svg>
            </button>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="min-w-touch min-h-touch flex items-center justify-center text-gray-400 hover:text-gray-600"
                aria-label="Clear selection"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={disabled}
            className="w-full input text-left flex items-center justify-between text-gray-500"
          >
            <span>{placeholder}</span>
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}
      </div>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setSearchQuery('');
        }}
        title="Select Company"
        height="half"
      >
        <div className="p-4">
          {/* Search */}
          <div className="relative mb-4">
            <input
              type="search"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
              autoFocus
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

          {/* Company List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : companies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No companies found' : 'No companies available'}
            </div>
          ) : (
            <div className="space-y-2">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => handleSelect(company)}
                  className={`w-full p-3 rounded-lg border text-left min-h-touch transition-colors ${
                    selected?.id === company.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">
                        {company.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {company.accountNumber && (
                          <span className="text-sm text-gray-500">
                            {company.accountNumber}
                          </span>
                        )}
                        {company.territoryName && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {company.territoryName}
                          </span>
                        )}
                      </div>
                    </div>
                    {selected?.id === company.id && (
                      <svg
                        className="w-5 h-5 text-primary-600 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

export default CompanyPicker;
