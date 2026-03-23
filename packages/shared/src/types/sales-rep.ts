export type RepRole = 'REP' | 'MANAGER' | 'ADMIN';

export interface SalesRep {
  id: string;
  shopId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: RepRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesRepListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: RepRole;
  isActive: boolean;
  territoryCount: number;
  companyCount: number;
}

export interface CreateSalesRepRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: RepRole;
  password: string;
}

export interface UpdateSalesRepRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role?: RepRole;
  isActive?: boolean;
  password?: string;
}

export interface SalesRepWithTerritories extends SalesRep {
  territories: Territory[];
}

export interface Territory {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TerritoryWithZipcodes extends Territory {
  zipcodes: string[];
}

export interface RepTerritory {
  id: string;
  repId: string;
  territoryId: string;
  isPrimary: boolean;
}
