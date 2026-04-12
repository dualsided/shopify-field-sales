import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface PaymentMethod {
  id: string;
  provider: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface Contact {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  paymentMethods?: PaymentMethod[];
}

interface ContactPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Currently selected contacts */
  selectedContacts: Contact[];
  /** Callback when contacts are selected */
  onSelect: (contacts: Contact[]) => void;
  /** Function to load available contacts */
  onLoadContacts: () => Promise<Contact[]>;
  /** Filter by company ID */
  companyId?: string;
  /** Allow multiple selection (default: false for single select) */
  multiple?: boolean | number;
  /** Label for the field */
  label?: string;
  /** Text shown when no contacts are selected */
  emptyText?: string;
  /** Button text when no contacts selected */
  selectButtonText?: string;
  /** Button text when contacts are selected */
  changeButtonText?: string;
}

export function ContactPicker({
  heading = "Select contact",
  selectedContacts,
  onSelect,
  onLoadContacts,
  companyId,
  multiple = false,
  label,
  emptyText = "No contact selected",
  selectButtonText = "Select Contact",
  changeButtonText = "Change",
}: ContactPickerProps) {
  const handleSelect = useCallback(async () => {
    let contacts = await onLoadContacts();

    // Filter by company if specified
    if (companyId) {
      contacts = contacts.filter((c) => c.companyId === companyId);
    }

    const selectedIds = await picker.open({
      heading,
      multiple,
      headers: [
        { content: "Name" },
        { content: "Email" },
        { content: "Title" },
      ],
      items: contacts.map((contact) => ({
        id: contact.id,
        heading: `${contact.firstName} ${contact.lastName}`,
        data: [contact.email || "—"],
        badges: contact.isPrimary
          ? [{ content: "Primary", tone: "info" as const }]
          : undefined,
        selected: selectedContacts.some((c) => c.id === contact.id),
      })),
    });

    if (selectedIds) {
      const selected = selectedIds
        .map((id) => contacts.find((c) => c.id === id))
        .filter((c): c is Contact => c !== undefined);
      onSelect(selected);
    }
  }, [heading, multiple, onLoadContacts, onSelect, selectedContacts, companyId]);

  return (
    <s-grid gridTemplateColumns={"1fr auto"} gap="small-200">
      <s-grid-item gridColumn="span 2">Billing Contact</s-grid-item>
      {selectedContacts.length > 0 ? (
        <>
          {selectedContacts.map((contact) => (
            <s-text-field
              key={contact.id}
              readOnly={true}
              icon="check-circle"
              value={`${contact.firstName} ${contact.lastName} (${contact.email})`}
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
            value={'Choose a contact...'}
          />
          <s-button variant="secondary" onClick={handleSelect}>
            {selectButtonText}
          </s-button>
        </>
      )}
    </s-grid>
  );
}
