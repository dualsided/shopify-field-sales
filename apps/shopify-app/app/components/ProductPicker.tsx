import { useCallback } from "react";
import { picker } from "../utils/shopify-ui";

export interface Product {
  id: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  title: string;
  variantTitle?: string | null;
  sku?: string | null;
  priceCents: number;
  imageUrl?: string | null;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

interface ProductPickerProps {
  /** Heading for the picker modal */
  heading?: string;
  /** Currently selected products */
  selectedProducts: Product[];
  /** Callback when products are selected */
  onSelect: (products: Product[]) => void;
  /** Function to load available products */
  onLoadProducts: () => Promise<Product[]>;
  /** Allow multiple selection (default: true) */
  multiple?: boolean | number;
  /** Label for the field */
  label?: string;
  /** Text shown when no products are selected */
  emptyText?: string;
  /** Button text when no products selected */
  selectButtonText?: string;
  /** Button text when products are selected */
  changeButtonText?: string;
}

export function ProductPicker({
  heading = "Select products",
  selectedProducts,
  onSelect,
  onLoadProducts,
  multiple = true,
  label,
  emptyText = "No products selected",
  selectButtonText = "Select Products",
  changeButtonText = "Change",
}: ProductPickerProps) {
  const handleSelect = useCallback(async () => {
    const products = await onLoadProducts();

    const selectedIds = await picker.open({
      heading,
      multiple,
      headers: [
        { content: "Product" },
        { content: "SKU" },
        { content: "Price", type: "number" },
      ],
      items: products.map((product) => ({
        id: product.id,
        heading: product.variantTitle
          ? `${product.title} - ${product.variantTitle}`
          : product.title,
        data: [product.sku || "—", formatCurrency(product.priceCents)],
        thumbnail: product.imageUrl ? { url: product.imageUrl } : undefined,
        selected: selectedProducts.some((p) => p.id === product.id),
      })),
    });

    if (selectedIds) {
      const selected = selectedIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is Product => p !== undefined);
      onSelect(selected);
    }
  }, [heading, multiple, onLoadProducts, onSelect, selectedProducts]);

  return (
    <s-grid gridTemplateColumns={"1fr auto"} gap="small-200">
      {label && <s-grid-item gridColumn="span 2">{label}</s-grid-item>}
      {selectedProducts.length > 0 ? (
        <>
          {selectedProducts.map((product) => (
            <s-text-field
              key={product.id}
              readOnly={true}
              icon="check-circle"
              value={product.variantTitle ? `${product.title} - ${product.variantTitle}` : product.title}
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
            value={'Choose a product...'}
          />
          <s-button variant="secondary" onClick={handleSelect}>
            {selectButtonText}
          </s-button>
        </>
      )}
    </s-grid>
  );
}
