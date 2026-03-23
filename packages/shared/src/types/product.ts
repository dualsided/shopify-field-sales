export type ProductStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT';

export interface Product {
  id: string;
  shopId: string;
  shopifyProductId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  productType: string | null;
  vendor: string | null;
  status: ProductStatus;
  isActive: boolean;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  productId: string;
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  priceCents: number;
  comparePriceCents: number | null;
  imageUrl: string | null;
  inventoryQuantity: number | null;
  isAvailable: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface ProductListItem {
  id: string;
  shopifyProductId: string;
  title: string;
  imageUrl: string | null;
  productType: string | null;
  vendor: string | null;
  status: ProductStatus;
  variantCount: number;
  minPriceCents: number;
  maxPriceCents: number;
}

export interface ProductVariantListItem {
  id: string;
  shopifyVariantId: string;
  productId: string;
  productTitle: string;
  title: string;
  sku: string | null;
  priceCents: number;
  imageUrl: string | null;
  inventoryQuantity: number | null;
  isAvailable: boolean;
}
