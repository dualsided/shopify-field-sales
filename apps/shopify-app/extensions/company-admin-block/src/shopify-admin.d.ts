// Augment JSX.IntrinsicElements for Shopify Admin UI components
// These are custom elements provided by the Shopify Admin Block runtime

declare namespace JSX {
  interface IntrinsicElements {
    "s-admin-block": {
      heading?: string;
      children?: preact.ComponentChildren;
    };
    "s-stack": {
      gap?: string;
      direction?: string;
      children?: preact.ComponentChildren;
    };
    "s-text": {
      color?: string;
      type?: string;
      children?: preact.ComponentChildren;
    };
    "s-divider": Record<string, never>;
    "s-button": {
      onClick?: () => void;
      variant?: string;
      children?: preact.ComponentChildren;
    };
  }
}
