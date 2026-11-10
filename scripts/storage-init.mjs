/**
 * 初始化 Neon Object Storage：建立 bucket（若不存在）並設定瀏覽器上傳所需的 CORS。
 *
 *   npm run storage:init
 *
 * 需要 .env／.env.local 或環境變數：
 *   AWS_ENDPOINT_URL_S3、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、AWS_REGION、STORAGE_BUCKET
 * 選用：
 *   APP_ORIGIN=https://your-site.netlify.app  （逗號分隔可設定多個來源）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const { getStorageConfig } = await import('../lib/config.js');
const { ensureBucket } = await import('../lib/storage.js');

const cfg = getStorageConfig();
if (!cfg.configured) {
  console.error('✗ 尚未設定物件儲存，請確認以下變數：');
  console.error('  AWS_ENDPOINT_URL_S3、AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、AWS_REGION、STORAGE_BUCKET');
  process.exit(1);
}

const origins = (process.env.APP_ORIGIN || 'http://localhost:3000,http://localhost:3100')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

try {
  const bucket = await ensureBucket({ corsOrigins: origins });
  console.log(`✓ bucket 就緒：${bucket}`);
  console.log(`  端點：${cfg.endpoint}`);
  console.log(`  CORS 允許來源：${origins.join(', ')}`);
} catch (err) {
  console.error('✗ 初始化 bucket 失敗：', err?.message || err);
  process.exit(1);
}