import { NextResponse } from 'next/server';
import { getSessionFromRequest } from './session';

/** API route 共用小工具 */

export function json(data, init) {
  return NextResponse.json(data, init);
}

export function fail(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 讀取 JSON body；解析失敗回傳 null */
export async function readBody(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 未登入回 401；已登入回傳 null 表示放行 */
export async function guard(req) {
  const session = await getSessionFromRequest(req);
  if (session) return null;
  return fail('尚未登入或 session 已過期', 401);
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 包住 handler：統一錯誤處理，DB 未設定時回 503 */
export function route(handler) {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const message = err?.message || String(err);
      if (/DATABASE_URL|AUTH_SECRET|APP_PASSWORD/.test(message)) {
        return fail(`伺服器設定錯誤：${message}`, 503);
      }
      if (err?.name === 'NeonDbError') {
        if (err.code === '23505') return fail('名稱已存在，請換一個', 409, { code: err.code });
        if (err.code === '23503') return fail('資料關聯冲突：請先處理相關筆記', 409, { code: err.code });
        return fail(`資料庫錯誤：${message}`, 500, { code: err.code });
      }
      console.error('[api error]', err);
      return fail('伺服器內部錯誤', 500);
    }
  };
}

/** 字串欄位清理：trim + 長度上限；undefined 表示「不變更」 */
export function cleanText(value, max, fallback = undefined) {
  if (value === undefined) return fallback;
  if (value === null) return '';
  return String(value).slice(0, max).trim();
}
