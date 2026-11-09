/**
 * 初始化資料庫結構（可重複執行）。
 *
 *   npm run db:init            # 建立表格與索引
 *   npm run db:reset           # 先清空資料（DROP TABLE）再重建
 *
 * 使用與應用程式完全相同的 Neon HTTP 路徑，因此本機（搭配 dev/shim）
 * 與 Neon 雲端都能用同一個指令。需要 .env 或環境變數中的 DATABASE_URL。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon, neonConfig } from '@neondatabase/serverless';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 簡易 .env 載入（只在環境變數未設定時使用）
function loadDotEnv() {
  const file = path.join(root, '.env.local');
  const target = fs.existsSync(file) ? file : path.join(root, '.env');
  if (!fs.existsSync(target)) return;
  for (const line of fs.readFileSync(target, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('✗ 尚未設定 DATABASE_URL');
  process.exit(1);
}
if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;

const sql = neon(url);
const schemaPath = path.join(root, 'sql', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

/** 把 SQL 檔切成敘述（忽略註解行；本專案的 SQL 沒有內含分號的字串） */
function splitStatements(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const statements = splitStatements(schema);
const reset = process.argv.includes('--reset');

try {
  if (reset) {
    console.log('⚠ 清空既有資料表…');
    await sql.query('DROP TABLE IF EXISTS note_tags, notes, tags, categories CASCADE');
  }

  console.log(`→ 套用 ${statements.length} 個敘述到資料庫…`);
  for (const statement of statements) {
    await sql.query(statement);
  }

  const tables = await sql.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('notes','categories','tags','note_tags')
      ORDER BY table_name`,
  );
  console.log(`✓ 完成。已存在的資料表：${tables.map((t) => t.table_name).join(', ')}`);
} catch (err) {
  console.error(`✗ 初始化失敗：${err.message}`);
  process.exit(1);
}
