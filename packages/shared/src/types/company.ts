export type SyncStatus = 'SYNCED' | 'PENDING' | 'SYNCING' | 'ERROR' | 'NOT_SYNCED';

export type PaymentTerms = 'DUE_ON_ORDER' | 'DUE_ON_RECEIPT' | 'DUE_ON_FULFILLMENT' | 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60';

export interface Company {
  id: string;
  shopId: string;
  shopifyCompanyId: string | null; // null for internal companies
  name: string;
  accountNumber: string | null;
  paymentTerms: PaymentTerms;
  territoryId: string | null;
  assignedRepId: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Optional expanded relations
  locations?: CompanyLocation[];
  contacts?: CompanyContact[];
}

export interface CompanyLocation {
  id: string;
  companyId: string;
  shopifyLocationId: string | null;
  name: string;
  isPrimary: boolean;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zipcode: string | null;
  country: string;
  countryCode: string;
  phone: string | null;
  isShippingAddress: boolean;
  isBillingAddress: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyContact {
  id: string;
  companyId: string;
  shopifyContactId: string | null;
  shopifyCustomerId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  canPlaceOrders: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyListItem {
  id: string;
  shopifyCompanyId: string | null;
  name: string;
  accountNumber: string | null;
  locationCount: number;
  contactCount: number;
  territoryName: string | null;
  assignedRepName: string | null;
  isShopifyManaged: boolean;
}

// Helper function to check if company is Shopify-managed
export function isShopifyManaged(company: { shopifyCompanyId: string | null }): boolean {
  return company.shopifyCompanyId !== null;
}

export interface ShopifyCompany {
  id: string;
  name: string;
  note: string | null;
  externalId: string | null;
  mainContact: {
    id: string;
    customer: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
    };
  } | null;
  locations: ShopifyCompanyLocation[];
}

export interface ShopifyCompanyLocation {
  id: string;
  name: string;
  shippingAddress: ShopifyAddress | null;
  billingAddress: ShopifyAddress | null;
}

export interface ShopifyAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  zip: string | null;
  countryCode: string;
}

// Request types for creating/updating internal companies
export interface CreateCompanyRequest {
  name: string;
  accountNumber?: string;
  paymentTerms?: PaymentTerms;
  territoryId?: string;
  assignedRepId?: string;
  locations?: CreateCompanyLocationRequest[];
  contacts?: CreateCompanyContactRequest[];
}

export interface CreateCompanyLocationRequest {
  name: string;
  isPrimary?: boolean;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  provinceCode?: string;
  zipcode?: string;
  country?: string;
  countryCode?: string;
  phone?: string;
  isShippingAddress?: boolean;
  isBillingAddress?: boolean;
}

export interface CreateCompanyContactRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  canPlaceOrders?: boolean;
}

export interface UpdateCompanyRequest {
  name?: string;
  accountNumber?: string;
  paymentTerms?: PaymentTerms;
  territoryId?: string | null;
  assignedRepId?: string | null;
  isActive?: boolean;
}
