import { fail, guard, isUuid, json, readBody, route } from '@/lib/api';
import { getMaxUploadBytes, isStorageConfigured } from '@/lib/config';
import { cleanFileName, cleanMime } from '@/lib/file-utils';
import { getFolder } from '@/lib/filedata';
import { newObjectKey, presignUpload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/files/upload-url — 取得一次性上傳網址
 * 瀏覽器拿到 presigned PUT 後直接上傳到 bucket，不經過 Next.js／Netlify 的請求大小限制。
 */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  if (!isStorageConfigured()) return fail('尚未設定物件儲存，檔案庫無法使用', 503);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const name = cleanFileName(body.name);
  const mime = cleanMime(body.mime);
  const size = Number(body.size);

  if (!Number.isFinite(size) || size <= 0) return fail('檔案大小不正確', 400);

  const max = getMaxUploadBytes();
  if (size > max) {
    return fail(`檔案超過 ${Math.round(max / 1024 / 1024)} MB 上限`, 413, { maxBytes: max });
  }

  let folderId = body.folderId ?? null;
  if (folderId === '') folderId = null;
  if (folderId && !isUuid(folderId)) return fail('資料夾 ID 格式不正確', 400);
  if (folderId && !(await getFolder(folderId))) return fail('上層資料夾不存在', 404);

  const key = newObjectKey();

  let signed;
  try {
    signed = await presignUpload({ key, contentType: mime, size });
  } catch (err) {
    console.error('[storage] 產生上傳網址失敗', err);
    return fail('物件儲存暫時無法使用，請稍後再試', 502);
  }

  return json({
    key,
    uploadUrl: signed.url,
    method: 'PUT',
    headers: signed.headers,
    expiresIn: signed.expiresIn,
    name,
    mime,
    size,
  });
});