import { useState, useRef, useCallback, useEffect } from "react";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";

interface Territory {
  id: string;
  name: string;
}

export interface SalesRepFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "REP" | "MANAGER";
  territoryIds: string[];
}

interface SalesRepData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: "REP" | "MANAGER";
  territoryIds: string[];
}

interface SalesRepFormProps {
  rep?: SalesRepData;
  territories: Territory[];
  onSubmit: (data: SalesRepFormData) => void;
  onCancel: () => void;
  actionError?: string;
}

const defaultValues: SalesRepFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "REP",
  territoryIds: [],
};

function repToFormData(rep?: SalesRepData): SalesRepFormData {
  if (!rep) return defaultValues;
  return {
    firstName: rep.firstName || "",
    lastName: rep.lastName || "",
    email: rep.email || "",
    phone: rep.phone || "",
    role: rep.role || "REP",
    territoryIds: rep.territoryIds || [],
  };
}

export function SalesRepForm({
  rep,
  territories,
  onSubmit,
  onCancel,
  actionError,
}: SalesRepFormProps) {
  const shopify = useAppBridge();
  const isEdit = !!rep?.id;

  // Store initial values in a ref so they're stable across renders
  const initialValuesRef = useRef<SalesRepFormData>(repToFormData(rep));

  // Form state
  const [formData, setFormData] = useState<SalesRepFormData>(initialValuesRef.current);

  // Check if form has changes compared to initial
  const isDirty = JSON.stringify(formData) !== JSON.stringify(initialValuesRef.current);

  // Helper to update form fields
  const updateField = useCallback(<K extends keyof SalesRepFormData>(
    field: K,
    value: SalesRepFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Handle discard action from save bar
  const handleDiscard = useCallback(() => {
    setFormData(initialValuesRef.current);
    shopify.saveBar.hide("sales-rep-form-save-bar");
  }, [shopify]);

  // Handle save action from save bar
  const handleSave = useCallback(() => {
    onSubmit(formData);
  }, [formData, onSubmit]);

  // Show/hide save bar based on dirty state
  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show("sales-rep-form-save-bar");
    } else {
      shopify.saveBar.hide("sales-rep-form-save-bar");
    }
  }, [isDirty, shopify]);

  // Toggle territory selection
  const toggleTerritory = useCallback((territoryId: string, checked: boolean) => {
    if (checked) {
      updateField("territoryIds", [...formData.territoryIds, territoryId]);
    } else {
      updateField("territoryIds", formData.territoryIds.filter((t) => t !== territoryId));
    }
  }, [formData.territoryIds, updateField]);

  return (
    <>
      <SaveBar id="sales-rep-form-save-bar">
        <button variant="primary" onClick={handleSave}></button>
        <button onClick={handleDiscard}></button>
      </SaveBar>

      <s-stack gap="base">
        {actionError && (
          <s-banner tone="critical">{actionError}</s-banner>
        )}

        <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
          <s-grid-item>
            <s-text-field
              label="First Name"
              value={formData.firstName}
              onInput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateField("firstName", target.value);
              }}
              required
            />
          </s-grid-item>
          <s-grid-item>
            <s-text-field
              label="Last Name"
              value={formData.lastName}
              onInput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateField("lastName", target.value);
              }}
              required
            />
          </s-grid-item>
          <s-grid-item>
            <s-email-field
              label="Email"
              value={formData.email}
              onInput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateField("email", target.value);
              }}
              required
            />
          </s-grid-item>
          <s-grid-item>
            <s-text-field
              label="Phone"
              value={formData.phone}
              onInput={(e: Event) => {
                const target = e.target as HTMLInputElement;
                updateField("phone", target.value);
              }}
            />
          </s-grid-item>
          <s-grid-item gridColumn="span 2">
            <s-select
              label="Role"
              value={formData.role}
              onChange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                updateField("role", target.value as "REP" | "MANAGER");
              }}
            >
              <s-option value="REP">Sales Rep</s-option>
              <s-option value="MANAGER">Sales Manager</s-option>
            </s-select>
          </s-grid-item>
        </s-grid>

        {territories.length > 0 && (
          <s-stack gap="base">
            <s-stack gap="none">
              <s-text>Assigned Territories</s-text>
              <s-text color="subdued">Select the territories this rep can access</s-text>
            </s-stack>
            <s-stack gap="base">
              {territories.map((territory) => (
                <s-checkbox
                  key={territory.id}
                  label={territory.name}
                  value={territory.id}
                  checked={formData.territoryIds.includes(territory.id)}
                  onChange={(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    toggleTerritory(territory.id, target.checked);
                  }}
                />
              ))}
            </s-stack>
          </s-stack>
        )}

        <s-button-group>
          <s-button variant="secondary" onClick={onCancel}>
            Cancel
          </s-button>
        </s-button-group>
      </s-stack>
    </>
  );
}
