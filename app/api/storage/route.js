import { json, route } from '@/lib/api';
import { getMaxUploadBytes, getStorageConfig } from '@/lib/config';
import { storageStats } from '@/lib/filedata';

export const dynamic = 'force-dynamic';

function hostOf(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

/** GET /api/storage — 檔案庫設定狀態與用量（不洩漏憑證） */
export const GET = route(async () => {
  const cfg = getStorageConfig();
  const stats = cfg.configured ? await storageStats() : null;
  return json({
    configured: cfg.configured,
    bucket: cfg.bucket || null,
    endpointHost: cfg.endpoint ? hostOf(cfg.endpoint) : null,
    region: cfg.region || null,
    maxUploadBytes: getMaxUploadBytes(),
    stats,
  });
});