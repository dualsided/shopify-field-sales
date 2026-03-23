import type { RepRole } from './sales-rep';

export interface JWTPayload {
  shopId: string;
  repId: string;
  role: RepRole;
  email: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  shopDomain?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  rep: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: RepRole;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
}
