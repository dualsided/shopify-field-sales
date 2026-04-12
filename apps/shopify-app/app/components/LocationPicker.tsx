import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface Location {
  id: string;
  companyId: string;
  name: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;
  zipcode?: string;
  country?: string;
  phone?: string;
  isPrimary?: boolean;
  isShippingAddress?: boolean;
  isBillingAddress?: boolean;
  // Payment terms from Shopify B2B buyerExperienceConfiguration
  paymentTermsType?: string; // NET_30, NET_60, DUE_ON_RECEIPT, etc.
  paymentTermsDays?: number; // Number of days for NET terms
  checkoutToDraft?: boolean; // Requires merchant review before processing
}

function formatAddress(location: Location): string {
  const parts = [location.address1, location.city, location.provinceCode || location.province, location.zipcode]
    .filter(Boolean);
  return parts.join(", ") || "—";
}

interface LocationPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Currently selected locations */
  selectedLocations: Location[];
  /** Callback when locations are selected */
  onSelect: (locations: Location[]) => void;
  /** Function to load available locations */
  onLoadLocations: () => Promise<Location[]>;
  /** Filter by company ID */
  companyId?: string;
  /** Filter to only show shipping addresses */
  shippingOnly?: boolean;
  /** Filter to only show billing addresses */
  billingOnly?: boolean;
  /** Allow multiple selection (default: false for single select) */
  multiple?: boolean | number;
  /** Label for the field */
  label?: string;
  /** Text shown when no locations are selected */
  emptyText?: string;
  /** Button text when no locations selected */
  selectButtonText?: string;
  /** Button text when locations are selected */
  changeButtonText?: string;
}

export function LocationPicker({
  heading = "Select location",
  selectedLocations,
  onSelect,
  onLoadLocations,
  companyId,
  shippingOnly,
  billingOnly,
  multiple = false,
  label,
  emptyText = "No location selected",
  selectButtonText = "Select Location",
  changeButtonText = "Change",
}: LocationPickerProps) {
  const handleSelect = useCallback(async () => {
    let locations = await onLoadLocations();

    // Apply filters
    if (companyId) {
      locations = locations.filter((l) => l.companyId === companyId);
    }
    if (shippingOnly) {
      locations = locations.filter((l) => l.isShippingAddress);
    }
    if (billingOnly) {
      locations = locations.filter((l) => l.isBillingAddress);
    }

    const selectedIds = await picker.open({
      heading,
      multiple,
      headers: [
        { content: "Location" },
        { content: "Address" },
      ],
      items: locations.map((location) => {
        const badges: Array<{ content: string; tone?: "info" | "success" }> = [];
        if (location.isPrimary) {
          badges.push({ content: "Primary", tone: "info" });
        }
        if (location.isShippingAddress && location.isBillingAddress) {
          badges.push({ content: "Ship & Bill" });
        } else if (location.isShippingAddress) {
          badges.push({ content: "Shipping" });
        } else if (location.isBillingAddress) {
          badges.push({ content: "Billing" });
        }

        return {
          id: location.id,
          heading: location.name,
          data: [formatAddress(location)],
          badges: badges.length > 0 ? badges : undefined,
          selected: selectedLocations.some((l) => l.id === location.id),
        };
      }),
    });

    if (selectedIds) {
      const selected = selectedIds
        .map((id) => locations.find((l) => l.id === id))
        .filter((l): l is Location => l !== undefined);
      onSelect(selected);
    }
  }, [heading, multiple, onLoadLocations, onSelect, selectedLocations, companyId, shippingOnly, billingOnly]);

  return (
    <s-grid gridTemplateColumns={"1fr auto"} gap="small-200">
      <s-grid-item gridColumn="span 2">Shipping Location</s-grid-item>
      {selectedLocations.length > 0 ? (
        <>
          {selectedLocations.map((location) => (
            <s-text-field
              key={location.id}
              readOnly={true}
              icon="check-circle"
              value={`${location.name} - ${formatAddress(location)}`}
            />
          ))}
          <s-button variant="tertiary" onClick={handleSelect}>
            {changeButtonText}
          </s-button>
        </>
      ) : (
        <>
          <s-text-field
            readOnly={true}
            value={'Choose a location to ship to...'}
          />
          <s-button variant="secondary" onClick={handleSelect}>
            {selectButtonText}
          </s-button>
        </>
      )}
    </s-grid>
  );
}
