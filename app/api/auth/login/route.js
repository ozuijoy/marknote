import { fail, readBody, route } from '@/lib/api';
import { rateLimitLogin, resetLoginAttempts, verifyPassword } from '@/lib/auth';
import { APP_NAME, checkRequiredEnv, getAppPassword, getEmbedAllowlist } from '@/lib/config';
import { query } from '@/lib/db';
import { authenticatedResponse } from '@/lib/session';

function clientKey(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || 'unknown';
  return ip;
}

export const POST = route(async (req) => {
  const missing = checkRequiredEnv();
  if (missing.length) {
    return fail(`伺服器尚未完成設定，缺少環境變數：${missing.join('、')}`, 503);
  }

  const key = clientKey(req);
  const limit = rateLimitLogin(key);
  if (!limit.allowed) {
    return fail(`登入嘗試次數過多，請 ${Math.ceil(limit.retryAfter / 60)} 分鐘後再試`, 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const ok = await verifyPassword(String(body.password ?? ''), getAppPassword());
  if (!ok) return fail('密碼錯誤', 401);
  resetLoginAttempts(key);

  // 順帶檢查資料庫連線，讓前端能在第一時間顯示設定問題
  let db = { ok: true };
  try {
    await query('SELECT 1 AS ok');
  } catch (err) {
    db = { ok: false, error: err?.message || String(err) };
  }

  return authenticatedResponse({ ok: true, appName: APP_NAME, db, embedHosts: getEmbedAllowlist() });
});
