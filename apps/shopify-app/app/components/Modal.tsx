/**
 * Modal Component
 *
 * A reusable modal wrapper that follows Shopify Polaris web component patterns.
 * Supports both declarative (commandFor/command) and programmatic control.
 *
 * @see https://shopify.dev/docs/api/app-home/web-components/overlays/modal
 */

import { type ReactNode, useRef, useEffect, useState } from "react";

type ModalSize = "small" | "small-100" | "base" | "large" | "large-100";
type ModalPadding = "base" | "none";

interface ModalAction {
  /** Button text */
  content: string;
  /** Click handler - called before modal closes */
  onAction?: () => void | Promise<void>;
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /**
   * Button variant - for primary action can be "primary" | "secondary" | "tertiary"
   * Note: secondary-actions slot only supports "secondary" variant (enforced by Shopify)
   */
  variant?: "primary" | "secondary" | "tertiary";
  /** Button tone for styling (e.g., "critical" for destructive actions) */
  tone?: "critical";
  /** Whether clicking this button should close the modal (default: true) */
  closeOnAction?: boolean;
}

export interface ModalProps {
  /** Unique ID for the modal - required for commandFor pattern */
  id: string;
  /** Modal heading/title */
  heading: string;
  /** Accessibility label for screen readers (defaults to heading) */
  accessibilityLabel?: string;
  /** Modal size */
  size?: ModalSize;
  /** Content padding */
  padding?: ModalPadding;
  /** Whether the modal is open (for programmatic control) */
  open?: boolean;
  /** Callback when modal requests to close */
  onClose?: () => void;
  /** Callback after modal is shown */
  onShow?: () => void;
  /** Callback after modal is hidden */
  onHide?: () => void;
  /** Primary action button configuration */
  primaryAction?: ModalAction;
  /** Secondary action buttons configuration */
  secondaryActions?: ModalAction[];
  /** Modal content */
  children: ReactNode;
}

// Extend HTMLElement for the s-modal custom element methods
interface SModalElement extends HTMLElement {
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
}

export function Modal({
  id,
  heading,
  accessibilityLabel,
  size = "base",
  padding = "base",
  open,
  onClose,
  onShow,
  onHide,
  primaryAction,
  secondaryActions,
  children,
}: ModalProps) {
  const modalRef = useRef<SModalElement>(null);

  // Handle programmatic open/close via the open prop
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    if (open) {
      modal.showOverlay();
    } else {
      modal.hideOverlay();
    }
  }, [open]);

  const handlePrimaryAction = async () => {
    if (primaryAction?.onAction) {
      await primaryAction.onAction();
    }
    // Close modal after action if closeOnAction is true (default)
    if (primaryAction?.closeOnAction !== false) {
      modalRef.current?.hideOverlay();
    }
  };

  const handleSecondaryAction = async (action: ModalAction) => {
    if (action.onAction) {
      await action.onAction();
    }
    // Close modal after action if closeOnAction is true (default)
    if (action.closeOnAction !== false) {
      modalRef.current?.hideOverlay();
    }
  };

  const handleAfterShow = () => {
    onShow?.();
  };

  const handleAfterHide = () => {
    onHide?.();
    // Call onClose when modal hides (for state sync)
    onClose?.();
  };

  return (
    <s-modal
      ref={modalRef as any}
      id={id}
      heading={heading}
      accessibilityLabel={accessibilityLabel || heading}
      size={size}
      padding={padding}
      onAfterShow={handleAfterShow}
      onAfterHide={handleAfterHide}
    >
      {children}

      {/* Secondary actions - render in order */}
      {/* Note: secondary-actions slot only accepts variant="secondary" or "auto" */}
      {secondaryActions?.map((action, index) => (
        <s-button
          key={index}
          slot="secondary-actions"
          variant="secondary"
          onClick={() => handleSecondaryAction(action)}
          loading={action.loading}
          disabled={action.disabled}
        >
          {action.content}
        </s-button>
      ))}

      {/* Primary action */}
      {primaryAction && (
        <s-button
          slot="primary-action"
          variant={primaryAction.variant || "primary"}
          tone={primaryAction.tone}
          onClick={handlePrimaryAction}
          loading={primaryAction.loading}
          disabled={primaryAction.disabled}
        >
          {primaryAction.content}
        </s-button>
      )}
    </s-modal>
  );
}

/**
 * Modal trigger button component
 *
 * Use this to create a button that opens a modal using the commandFor pattern.
 */
interface ModalTriggerProps {
  /** The modal ID to open */
  modalId: string;
  /** Button content */
  children: ReactNode;
  /** Button variant */
  variant?: "primary" | "secondary" | "tertiary";
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button tone */
  tone?: "critical";
  /** Button icon */
  icon?: string;
  /** Optional click handler (runs before showing modal) */
  onClick?: () => void;
}

export function ModalTrigger({
  modalId,
  children,
  variant = "secondary",
  disabled,
  tone,
  icon,
  onClick,
}: ModalTriggerProps) {
  return (
    <s-button
      commandFor={modalId}
      command="--show"
      variant={variant}
      disabled={disabled}
      tone={tone}
      icon={icon as any}
      onClick={onClick}
    >
      {children}
    </s-button>
  );
}

/**
 * Hook to generate a unique modal ID
 */
let modalIdCounter = 0;
export function useModalId(prefix = "modal"): string {
  const [id] = useState(() => `${prefix}-${++modalIdCounter}`);
  return id;
}
