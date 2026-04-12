'use client';

import { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { api } from '@/lib/api';

export interface LocationOption {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string | null;
  phone: string | null;
  isPrimary: boolean;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
}

interface LocationPickerProps {
  companyId: string | null;
  selected: LocationOption | null;
  onSelect: (location: LocationOption | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  /** Filter to show only shipping addresses */
  shippingOnly?: boolean;
  /** Filter to show only billing addresses */
  billingOnly?: boolean;
}

interface LocationItem {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string | null;
  phone: string | null;
  isPrimary: boolean;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
}

export function LocationPicker({
  companyId,
  selected,
  onSelect,
  disabled = false,
  label = 'Location',
  placeholder = 'Select a location...',
  shippingOnly = false,
  billingOnly = false,
}: LocationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLocations = useCallback(async () => {
    if (!companyId) {
      setLocations([]);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.client.locations.list({ companyId });

      if (data) {
        let filteredLocations = data as LocationItem[];

        // Apply filters
        if (shippingOnly) {
          filteredLocations = filteredLocations.filter((l) => l.isShippingAddress);
        }
        if (billingOnly) {
          filteredLocations = filteredLocations.filter((l) => l.isBillingAddress);
        }

        setLocations(filteredLocations);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId, shippingOnly, billingOnly]);

  // Load locations when sheet opens
  useEffect(() => {
    if (isOpen && companyId) {
      fetchLocations();
    }
  }, [isOpen, fetchLocations, companyId]);

  const handleSelect = (location: LocationItem) => {
    onSelect({
      id: location.id,
      name: location.name,
      address1: location.address1,
      address2: location.address2,
      city: location.city,
      province: location.province,
      provinceCode: location.provinceCode,
      zipcode: location.zipcode,
      country: location.country,
      phone: location.phone,
      isPrimary: location.isPrimary,
      isShippingAddress: location.isShippingAddress,
      isBillingAddress: location.isBillingAddress,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
  };

  const formatAddress = (location: LocationOption | LocationItem) => {
    const parts = [
      location.address1,
      location.city,
      location.province || location.provinceCode,
      location.zipcode,
    ].filter(Boolean);
    return parts.join(', ') || 'No address';
  };

  const getBadges = (location: LocationOption | LocationItem) => {
    const badges: { label: string; color: string }[] = [];

    if (location.isPrimary) {
      badges.push({ label: 'Primary', color: 'bg-primary-100 text-primary-700' });
    }
    if (location.isShippingAddress && location.isBillingAddress) {
      badges.push({ label: 'Ship & Bill', color: 'bg-gray-100 text-gray-700' });
    } else if (location.isShippingAddress) {
      badges.push({ label: 'Shipping', color: 'bg-green-100 text-green-700' });
    } else if (location.isBillingAddress) {
      badges.push({ label: 'Billing', color: 'bg-blue-100 text-blue-700' });
    }

    return badges;
  };

  // Disable if no company selected
  const isDisabled = disabled || !companyId;

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
              onClick={() => !isDisabled && setIsOpen(true)}
              disabled={isDisabled}
              className="flex-1 input text-left flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900 truncate">{selected.name}</p>
                  {getBadges(selected).map((badge) => (
                    <span
                      key={badge.label}
                      className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-500 truncate">{formatAddress(selected)}</p>
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
            {!isDisabled && (
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
            disabled={isDisabled}
            className={`w-full input text-left flex items-center justify-between ${
              isDisabled ? 'bg-gray-50 text-gray-400' : 'text-gray-500'
            }`}
          >
            <span>{!companyId ? 'Select a company first' : placeholder}</span>
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
        onClose={() => setIsOpen(false)}
        title={shippingOnly ? 'Select Shipping Location' : billingOnly ? 'Select Billing Location' : 'Select Location'}
        height="half"
      >
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No locations available
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => handleSelect(location)}
                  className={`w-full p-3 rounded-lg border text-left min-h-touch transition-colors ${
                    selected?.id === location.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-medium text-gray-900 truncate">
                          {location.name}
                        </p>
                        {getBadges(location).map((badge) => (
                          <span
                            key={badge.label}
                            className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {formatAddress(location)}
                      </p>
                    </div>
                    {selected?.id === location.id && (
                      <svg
                        className="w-5 h-5 text-primary-600 flex-shrink-0 ml-2"
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

export default LocationPicker;
