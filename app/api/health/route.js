import { checkRequiredEnv } from '@/lib/config';
import { query } from '@/lib/db';

/**
 * GET /api/health — 部署後的健康檢查（不需登入，但不會洩漏任何資料）
 * 回傳環境變數是否齊全、資料庫是否可連線。
 */
export async function GET() {
  const missing = checkRequiredEnv();
  const payload = { ok: missing.length === 0, missingEnv: missing, db: null };

  if (!missing.includes('DATABASE_URL')) {
    try {
      const rows = await query('SELECT 1 AS ok');
      payload.db = { ok: true, rows: rows?.length ?? 0 };
    } catch (err) {
      payload.ok = false;
      payload.db = { ok: false, error: err?.message || String(err) };
    }
  } else {
    payload.ok = false;
  }

  return Response.json(payload, { status: payload.ok ? 200 : 503 });
}
