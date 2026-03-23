import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';
import type { JWTPayload, RepRole } from '@field-sales/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 3600; // default 1 hour

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 3600;
  }
}

export async function createAccessToken(payload: {
  shopId: string;
  repId: string;
  role: RepRole;
  email: string;
}): Promise<string> {
  const expiresIn = parseExpiry(JWT_EXPIRES_IN);

  return new SignJWT({
    shopId: payload.shopId,
    repId: payload.repId,
    role: payload.role,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(JWT_SECRET);
}

export async function createRefreshToken(payload: {
  shopId: string;
  repId: string;
}): Promise<string> {
  const expiresIn = parseExpiry(REFRESH_TOKEN_EXPIRES_IN);

  return new SignJWT({
    shopId: payload.shopId,
    repId: payload.repId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<{ shopId: string; repId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as JoseJWTPayload & { type?: string; shopId?: string; repId?: string };
    if (p.type !== 'refresh') return null;
    if (!p.shopId || !p.repId) return null;
    return { shopId: p.shopId, repId: p.repId };
  } catch {
    return null;
  }
}

export function getAccessTokenExpiry(): number {
  return parseExpiry(JWT_EXPIRES_IN);
}
