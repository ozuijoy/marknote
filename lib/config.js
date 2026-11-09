/**
 * 集中管理環境變數與預設值。
 * 所有可調參數都在這裡，方便在 Netlify 環境變數中一次設定。
 */

/** 應用程式名稱（顯示於登入頁、側邊欄、PWA manifest） */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'MarkNote';

/** Neon / PostgreSQL 連線字串 */
export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
  return url.trim();
}

/** 單一登入密碼（自用設計，無使用者註冊） */
export function getAppPassword() {
  return process.env.APP_PASSWORD || '';
}

/** session JWT 簽章金鑰 */
export function getAuthSecret() {
  return process.env.AUTH_SECRET || '';
}

/** session 有效秒數 */
export function getSessionMaxAge() {
  const days = Number.parseInt(process.env.SESSION_MAX_AGE_DAYS || '7', 10);
  const safe = Number.isFinite(days) && days > 0 ? days : 7;
  return Math.round(safe * 24 * 60 * 60);
}

/**
 * cookie 是否只走 HTTPS。
 * auto：production 視為 https（Netlify 一定 https），本機開發走 http。
 */
export function isSecureCookie() {
  const flag = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

/** session cookie 名稱；HTTPS 環境使用 __Host- 前綴綁定來源 */
export function getSessionCookieName() {
  const base = process.env.SESSION_COOKIE_NAME?.trim() || 'mn_session';
  return isSecureCookie() ? `__Host-${base}` : base;
}

/** 閱讀模式允許内嵌 iframe 的網域白名單 */
export const DEFAULT_EMBED_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'player.bilibili.com',
];

export function getEmbedAllowlist() {
  const raw = process.env.EMBED_ALLOWLIST;
  if (raw === undefined) return DEFAULT_EMBED_HOSTS;
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** 環境變數體檢：回傳缺少的必要項目（用於登入頁／健康檢查） */
export function checkRequiredEnv() {
  const missing = [];
  if (!getDatabaseUrl()) missing.push('DATABASE_URL');
  if (!getAppPassword()) missing.push('APP_PASSWORD');
  if (!getAuthSecret()) missing.push('AUTH_SECRET');
  return missing;
}
