import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface SalesRep {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  territoryCount?: number;
}

export interface TerritoryRep {
  repName: string;
  territoryName: string;
  locationName?: string;
}

interface SalesRepPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Manually assigned sales rep (admin override) */
  selectedRep: SalesRep | null;
  /** Auto-assigned reps from territories (one per location/territory) */
  territoryReps?: TerritoryRep[];
  /** Callback when a rep is selected */
  onSelect: (rep: SalesRep | null) => void;
  /** Function to load available reps */
  onLoadReps: () => Promise<SalesRep[]>;
  /** Button text when rep is selected */
  changeButtonText?: string;
  /** Callback after successful selection */
  onSuccess?: (rep: SalesRep | null) => void;
}

export function SalesRepPicker({
  heading = "Select sales rep",
  selectedRep,
  territoryReps = [],
  onSelect,
  onLoadReps,
  changeButtonText = "Change",
  onSuccess,
}: SalesRepPickerProps) {
  const handleSelect = useCallback(async () => {
    const reps = await onLoadReps();

    const selectedIds = await picker.open({
      heading,
      multiple: false,
      headers: [
        { content: "Rep" },
        { content: "Email" },
        { content: "Role" },
      ],
      items: reps.map((rep) => ({
        id: rep.id,
        heading: rep.name,
        data: [rep.email || "—", rep.role || "—"],
        selected: selectedRep?.id === rep.id,
      })),
    });

    if (selectedIds) {
      if (selectedIds.length === 0) {
        onSelect(null);
        if (onSuccess) onSuccess(null);
      } else {
        const selected = reps.find((r) => r.id === selectedIds[0]);
        if (selected) {
          onSelect(selected);
          if (onSuccess) onSuccess(selected);
        }
      }
    }
  }, [heading, onLoadReps, onSelect, onSuccess, selectedRep]);

  const handleClear = useCallback(() => {
    onSelect(null);
    if (onSuccess) onSuccess(null);
  }, [onSelect, onSuccess]);

  // Case 1: Manually assigned rep (admin override)
  if (selectedRep) {
    return (
      <s-grid gridTemplateColumns="1fr auto auto" gap="small-200">
        <s-text-field
          readOnly={true}
          icon="check-circle"
          value={selectedRep.name}
          details="Manually assigned"
        />
        <s-box>
          <s-button variant="tertiary" onClick={handleSelect}>{changeButtonText}</s-button>
        </s-box>
        <s-box>
          <s-button variant="tertiary" tone="critical" onClick={handleClear}>Clear</s-button>
        </s-box>
      </s-grid>
    );
  }

  // Case 2: Auto-assigned from territories (no manual override)
  if (territoryReps.length > 0) {
    // Get unique rep names
    const uniqueReps = [...new Set(territoryReps.map(tr => tr.repName))];

    if (uniqueReps.length === 1) {
      // Single rep across all territories
      return (
        <s-grid gridTemplateColumns="1fr auto" gap="small-200">
          <s-text-field
            readOnly={true}
            value={uniqueReps[0]}
            details="Assigned via territory"
          />
          <s-box>
            <s-button variant="tertiary" onClick={handleSelect}>
              Override
            </s-button>
          </s-box>
        </s-grid>
      );
    }

    // Multiple reps across different territories
    return (
      <s-stack gap="small-200">
        <s-grid gridTemplateColumns="1fr auto" gap="small-200">
          <s-text color="subdued">Multiple reps via territories</s-text>
          <s-button variant="tertiary" onClick={handleSelect}>
            Override
          </s-button>
        </s-grid>
        {territoryReps.map((tr, index) => (
          <s-grid key={index} gridTemplateColumns="1fr 1fr" gap="small-200">
            <s-text>{tr.repName}</s-text>
            <s-text color="subdued">{tr.territoryName}{tr.locationName ? ` (${tr.locationName})` : ''}</s-text>
          </s-grid>
        ))}
      </s-stack>
    );
  }

  // Case 3: No rep assigned (no territory or no rep on territory)
  return (
    <s-grid gridTemplateColumns="1fr auto" gap="small-200">
      <s-text-field
        readOnly={true}
        value="No rep assigned"
      />
      <s-button variant="secondary" onClick={handleSelect}>
        Assign Rep
      </s-button>
    </s-grid>
  );
}
