export interface TerritoryListItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  zipcodeCount: number;
  repCount: number;
  companyCount: number;
}

export interface CreateTerritoryRequest {
  name: string;
  description?: string;
  zipcodes?: string[];
}

export interface UpdateTerritoryRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  zipcodes?: string[];
}
