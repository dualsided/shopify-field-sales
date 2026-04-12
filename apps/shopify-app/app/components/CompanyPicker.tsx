import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface Company {
  id: string;
  name: string;
  accountNumber?: string;
  territoryId?: string;
  territoryName?: string;
}

interface CompanyPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Currently selected companies */
  selectedCompanies: Company[];
  /** Callback when companies are selected */
  onSelect: (companies: Company[]) => void;
  /** Function to load available companies */
  onLoadCompanies: () => Promise<Company[]>;
  /** Filter by territory ID */
  territoryId?: string;
  /** Allow multiple selection (default: false for single select) */
  multiple?: boolean | number;
  /** Label for the field */
  label?: string;
  /** Text shown when no companies are selected */
  emptyText?: string;
  /** Button text when no companies selected */
  selectButtonText?: string;
  /** Button text when companies are selected */
  changeButtonText?: string;
  /** Callback after successful selection (for showing toast, etc.) */
  onSuccess?: (companies: Company[]) => void;
}

export function CompanyPicker({
  heading = "Select company",
  selectedCompanies,
  onSelect,
  onLoadCompanies,
  territoryId,
  multiple = false,
  label,
  emptyText = "No company selected",
  selectButtonText = "Select Company",
  changeButtonText = "Change",
  onSuccess,
}: CompanyPickerProps) {
  const handleSelect = useCallback(async () => {
    let companies = await onLoadCompanies();

    // Filter by territory if specified
    if (territoryId) {
      companies = companies.filter((c) => c.territoryId === territoryId);
    }

    const selectedIds = await picker.open({
      heading,
      multiple,
      headers: [
        { content: "Company" },
        { content: "Account #" },
        { content: "Territory" },
      ],
      items: companies.map((company) => ({
        id: company.id,
        heading: company.name,
        data: [company.accountNumber || "—", company.territoryName || "—"],
        selected: selectedCompanies.some((c) => c.id === company.id),
      })),
    });

    if (selectedIds) {
      const selected = selectedIds
        .map((id) => companies.find((c) => c.id === id))
        .filter((c): c is Company => c !== undefined);
      onSelect(selected);
      if (onSuccess && selected.length > 0) {
        onSuccess(selected);
      }
    }
  }, [heading, multiple, onLoadCompanies, onSelect, onSuccess, selectedCompanies, territoryId]);

  return (
    <s-grid gridTemplateColumns={"1fr auto"} gap="small-200">
      <s-grid-item gridColumn="span 2">Account</s-grid-item>
      {selectedCompanies.length > 0 ? (
        <>
          {selectedCompanies.map((company) => (
            <s-text-field
              key={company.id}
              readOnly={true}
              icon="check-circle"
              value={`${company.name} (${company.accountNumber ? company.accountNumber : 'No Company ID'})`}
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
            value={'Choose a company...'}
          />
          <s-button variant="secondary" onClick={handleSelect}>
            {selectButtonText}
          </s-button>
        </>
      )}
    </s-grid>
  );
}
