'use client';

import { useState, useEffect, useCallback } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { api } from '@/lib/api';

export interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

interface ContactPickerProps {
  companyId: string | null;
  selected: ContactOption | null;
  onSelect: (contact: ContactOption | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

interface ContactItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

export function ContactPicker({
  companyId,
  selected,
  onSelect,
  disabled = false,
  label = 'Contact',
  placeholder = 'Select a contact...',
}: ContactPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!companyId) {
      setContacts([]);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.client.contacts.list({ companyId });

      if (data) {
        setContacts(data as ContactItem[]);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Load contacts when sheet opens
  useEffect(() => {
    if (isOpen && companyId) {
      fetchContacts();
    }
  }, [isOpen, fetchContacts, companyId]);

  const handleSelect = (contact: ContactItem) => {
    onSelect({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      isPrimary: contact.isPrimary,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
  };

  const formatContactName = (contact: ContactOption | ContactItem) => {
    return `${contact.firstName} ${contact.lastName}`;
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
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">
                    {formatContactName(selected)}
                  </p>
                  {selected.isPrimary && (
                    <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">{selected.email}</p>
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
        title="Select Contact"
        height="half"
      >
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No contacts available
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelect(contact)}
                  className={`w-full p-3 rounded-lg border text-left min-h-touch transition-colors ${
                    selected?.id === contact.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {formatContactName(contact)}
                        </p>
                        {contact.isPrimary && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded flex-shrink-0">
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">{contact.email}</p>
                      {contact.title && (
                        <p className="text-xs text-gray-400 truncate">{contact.title}</p>
                      )}
                    </div>
                    {selected?.id === contact.id && (
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

export default ContactPicker;
