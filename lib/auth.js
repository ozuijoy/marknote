/**
 * 密碼比對與登入限流。
 * 只在 Node Runtime 使用（Edge middleware 走 lib/session.js）。
 */

/** 密碼比對：先雜湊再逐位元比對，避免 timing attack */
export async function verifyPassword(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([sha256(enc.encode(input)), sha256(enc.encode(expected))]);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  }
  const { createHash } = await import('node:crypto');
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

/**
 * 登入暴力破解限流（單一 instance 記憶體，盡力而為）。
 * Netlify Functions 生命週期短，這只擋住同 instance 的連續嘗試。
 */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;

export function rateLimitLogin(key = 'global') {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.first + WINDOW_MS - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function resetLoginAttempts(key = 'global') {
  attempts.delete(key);
}
