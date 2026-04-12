import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface Territory {
  id: string;
  name: string;
  description?: string;
  stateCount?: number;
  zipcodeCount?: number;
  locationCount?: number;
}

interface TerritoryPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Currently selected territories */
  selectedTerritories: Territory[];
  /** Callback when territories are selected */
  onSelect: (territories: Territory[]) => void;
  /** Function to load available territories */
  onLoadTerritories: () => Promise<Territory[]>;
  /** Button text when territories are selected */
  changeButtonText?: string;
  /** Callback after successful selection */
  onSuccess?: (territories: Territory[]) => void;
}

export function TerritoryPicker({
  heading = "Select territories",
  selectedTerritories,
  onSelect,
  onLoadTerritories,
  changeButtonText = "Change",
  onSuccess,
}: TerritoryPickerProps) {
  const handleSelect = useCallback(async () => {
    const territories = await onLoadTerritories();

    const selectedIds = await picker.open({
      heading,
      multiple: true,
      headers: [
        { content: "Territory" },
        { content: "States" },
        { content: "Locations" },
      ],
      items: territories.map((territory) => ({
        id: territory.id,
        heading: territory.name,
        data: [
          territory.stateCount ? `${territory.stateCount} states` : "—",
          territory.locationCount ? `${territory.locationCount} locations` : "—",
        ],
        selected: selectedTerritories.some((t) => t.id === territory.id),
      })),
    });

    if (selectedIds) {
      const selected = selectedIds
        .map((id) => territories.find((t) => t.id === id))
        .filter((t): t is Territory => t !== undefined);
      onSelect(selected);
      if (onSuccess) onSuccess(selected);
    }
  }, [heading, onLoadTerritories, onSelect, onSuccess, selectedTerritories]);

  const handleClear = useCallback(() => {
    onSelect([]);
    if (onSuccess) onSuccess([]);
  }, [onSelect, onSuccess]);

  // Has selected territories
  if (selectedTerritories.length > 0) {
    return (
      <s-stack gap="small-200">
        <s-grid gridTemplateColumns="1fr auto auto" gap="small-200">
          <s-text>
            {selectedTerritories.length} {selectedTerritories.length === 1 ? "territory" : "territories"} assigned
          </s-text>
          <s-button variant="tertiary" onClick={handleSelect}>
            {changeButtonText}
          </s-button>
          <s-button variant="tertiary" onClick={handleClear}>
            Clear
          </s-button>
        </s-grid>
        {selectedTerritories.map((territory) => (
          <s-text-field
            key={territory.id}
            readOnly={true}
            icon="check-circle"
            value={`${territory.name} - ${territory.locationCount ? ` ${territory.locationCount}` : 'no locations assigned'}`}
          />
        ))}
      </s-stack>
    );
  }

  // No territories selected
  return (
    <s-grid gridTemplateColumns="1fr auto" gap="small-200">
      <s-text-field
        readOnly={true}
        value="No territories assigned"
      />
      <s-button variant="secondary" onClick={handleSelect}>
        Assign Territories
      </s-button>
    </s-grid>
  );
}
