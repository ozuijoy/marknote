import { SignJWT, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { getAuthSecret, getSessionCookieName, getSessionMaxAge, isSecureCookie } from './config';

/**
 * Session（JWT）簽發與驗證。
 * 只依賴 jose，因此在 Edge Runtime（middleware）與 Node Runtime 都能使用。
 */

const ISSUER = 'marknote';
const AUDIENCE = 'marknote-web';

function secretKey() {
  const secret = getAuthSecret();
  if (!secret) throw new Error('尚未設定 AUTH_SECRET');
  return new TextEncoder().encode(secret);
}

export async function createSessionToken() {
  const days = Math.max(1, Math.round(getSessionMaxAge() / 86400));
  return new SignJWT({ auth: 'password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

/** 驗證 token；無效／過期回傳 null（不丟錯） */
export async function verifySessionToken(token) {
  if (!token || !getAuthSecret()) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, audience: AUDIENCE });
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/',
    maxAge: getSessionMaxAge(),
  };
}

export async function authenticatedResponse(body = { ok: true }) {
  const token = await createSessionToken();
  const res = NextResponse.json(body);
  res.cookies.set(getSessionCookieName(), token, sessionCookieOptions());
  return res;
}

export function loggedOutResponse(body = { ok: true }) {
  const res = NextResponse.json(body);
  res.cookies.set(getSessionCookieName(), '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

/** 從 Request 讀 cookie 並驗證 */
export async function getSessionFromRequest(req) {
  const token = req?.cookies?.get?.(getSessionCookieName())?.value;
  return verifySessionToken(token);
}
