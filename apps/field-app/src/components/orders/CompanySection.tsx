'use client';

import { CompanyPicker, type CompanyOption } from '../pickers/CompanyPicker';
import { ContactPicker, type ContactOption } from '../pickers/ContactPicker';
import { LocationPicker, type LocationOption } from '../pickers/LocationPicker';

interface CompanySectionProps {
  company: CompanyOption | null;
  contact: ContactOption | null;
  shippingLocation: LocationOption | null;
  onCompanyChange: (company: CompanyOption | null) => void;
  onContactChange: (contact: ContactOption | null) => void;
  onShippingLocationChange: (location: LocationOption | null) => void;
  readonly?: boolean;
}

export function CompanySection({
  company,
  contact,
  shippingLocation,
  onCompanyChange,
  onContactChange,
  onShippingLocationChange,
  readonly = false,
}: CompanySectionProps) {
  // Read-only view
  if (readonly) {
    return (
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Company</h2>

        <div className="space-y-4">
          {/* Company */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Company</p>
            {company ? (
              <div>
                <p className="font-medium text-gray-900">{company.name}</p>
                {company.accountNumber && (
                  <p className="text-sm text-gray-500">Account: {company.accountNumber}</p>
                )}
              </div>
            ) : (
              <p className="text-gray-400">No company selected</p>
            )}
          </div>

          {/* Contact */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Contact</p>
            {contact ? (
              <div>
                <p className="font-medium text-gray-900">
                  {contact.firstName} {contact.lastName}
                </p>
                <p className="text-sm text-gray-500">{contact.email}</p>
              </div>
            ) : (
              <p className="text-gray-400">No contact selected</p>
            )}
          </div>

          {/* Shipping Location */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Shipping Location</p>
            {shippingLocation ? (
              <div>
                <p className="font-medium text-gray-900">{shippingLocation.name}</p>
                <p className="text-sm text-gray-500">
                  {[
                    shippingLocation.address1,
                    shippingLocation.city,
                    shippingLocation.province || shippingLocation.provinceCode,
                    shippingLocation.zipcode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            ) : (
              <p className="text-gray-400">No location selected</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-4">Company</h2>

      <div className="space-y-4">
        <CompanyPicker
          selected={company}
          onSelect={onCompanyChange}
          label="Company"
          placeholder="Select a company..."
        />

        <ContactPicker
          companyId={company?.id || null}
          selected={contact}
          onSelect={onContactChange}
          label="Contact"
          placeholder="Select a contact..."
        />

        <LocationPicker
          companyId={company?.id || null}
          selected={shippingLocation}
          onSelect={onShippingLocationChange}
          label="Shipping Location"
          placeholder="Select shipping location..."
          shippingOnly
        />
      </div>
    </div>
  );
}

export default CompanySection;
