import { neon, neonConfig } from '@neondatabase/serverless';
import { getDatabaseUrl } from './config';

/**
 * Neon serverless HTTP driver 的單例。
 * HTTP 模式下每個請求都是無狀態的，因此不需要（也不能）維持連線池。
 */
let sqlFn = null;

export function getSql() {
  if (sqlFn) return sqlFn;
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error('尚未設定 DATABASE_URL（Neon 連線字串）');
  }
  // 開發／測試可把 HTTP 查詢導向 Neon 相容端點；正式環境不會設定此變數
  if (process.env.NEON_FETCH_ENDPOINT) {
    neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
  }
  sqlFn = neon(url);
  return sqlFn;
}

/**
 * 執行單一查詢。
 * @param {string} text SQL，使用 $1、$2 佔位符
 * @param {unknown[]} [params]
 * @returns {Promise<any[]>} rows（物件陣列）
 */
export async function query(text, params = []) {
  return getSql().query(text, params);
}

/** 回傳第一筆，沒有則 null */
export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows?.[0] ?? null;
}

/**
 * 以單一 HTTP 請求執行多個查詢，包在同一個 Postgres transaction 中。
 * Neon HTTP driver 的 transaction() 需要「尚未執行」的 query 物件陣列。
 * @param {{text: string, params?: unknown[]}[]} statements
 */
export async function transaction(statements) {
  const sql = getSql();
  const pending = statements.map((s) => sql.query(s.text, s.params ?? []));
  return sql.transaction(pending);
}
