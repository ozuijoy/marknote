import { fail, guard, isUuid, json, readBody, route } from '@/lib/api';
import { getMaxUploadBytes, isStorageConfigured } from '@/lib/config';
import { cleanFileName, cleanMime } from '@/lib/file-utils';
import { fileDto, folderPath, getFileByKey, getFolder, listFiles, createFile, storageStats } from '@/lib/filedata';
import { deleteObject, headObject, isObjectKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** GET /api/files?folderId= — 列出資料夾內的檔案 */
export const GET = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const folderId = new URL(req.url).searchParams.get('folderId') || null;
  if (folderId && !isUuid(folderId)) return fail('資料夾 ID 格式不正確', 400);

  let folder = null;
  if (folderId) {
    folder = await getFolder(folderId);
    if (!folder) return fail('找不到這個資料夾', 404);
  }

  const [rows, path, stats] = await Promise.all([listFiles(folderId), folderPath(folderId), storageStats()]);
  return json({
    folder: folder ? { id: folder.id, name: folder.name } : null,
    path: path.map((p) => ({ id: p.id, name: p.name })),
    files: rows.map(fileDto),
    stats,
  });
});

/**
 * POST /api/files — 上傳完成後登記檔案
 * 伺服器以 HeadObject 驗證物件真的存在，並以實際大小為準。
 */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  if (!isStorageConfigured()) return fail('尚未設定物件儲存，檔案庫無法使用', 503);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const key = String(body.key ?? '');
  if (!isObjectKey(key)) return fail('物件 key 格式不正確', 400);

  if (await getFileByKey(key)) return fail('這個檔案已經登記過了', 409);

  let folderId = body.folderId ?? null;
  if (folderId === '') folderId = null;
  if (folderId && !isUuid(folderId)) return fail('資料夾 ID 格式不正確', 400);
  if (folderId && !(await getFolder(folderId))) return fail('上層資料夾不存在', 404);

  let head;
  try {
    head = await headObject(key);
  } catch (err) {
    console.error('[storage] HeadObject 失敗', err);
    return fail('無法確認上傳結果，請稍後再試', 502);
  }
  if (!head) return fail('找不到剛上傳的檔案，請重新上傳', 400);

  if (head.size > getMaxUploadBytes()) {
    await deleteObject(key).catch(() => {});
    return fail('檔案超過大小上限', 413);
  }

  const file = await createFile({
    name: cleanFileName(body.name),
    mime: cleanMime(head.contentType || body.mime),
    size: head.size || Number(body.size) || 0,
    objectKey: key,
    folderId,
  });

  return json({ file: fileDto(file) }, { status: 201 });
});