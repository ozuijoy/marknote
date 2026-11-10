import { cleanText, fail, guard, isUuid, json, readBody, route } from '@/lib/api';
import { isStorageConfigured } from '@/lib/config';
import { cleanFileName } from '@/lib/file-utils';
import { deleteFileRow, fileDto, getFile, getFolder, moveFile, renameFile } from '@/lib/filedata';
import { deleteObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';

async function resolveId(ctx) {
  const params = await ctx.params;
  const id = params?.id;
  return { id, valid: isUuid(id) };
}

/** GET /api/files/:id — 單一檔案中介資料 */
export const GET = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('檔案 ID 格式不正確', 400);

  const file = await getFile(id);
  if (!file) return fail('找不到這個檔案', 404);
  return json({ file: fileDto(file) });
});

/** PATCH /api/files/:id — 重新命名或移動 { name?, folderId? } */
export const PATCH = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('檔案 ID 格式不正確', 400);

  const file = await getFile(id);
  if (!file) return fail('找不到這個檔案', 404);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  let current = file;

  if (body.name !== undefined) {
    const name = cleanFileName(cleanText(body.name, 255, ''));
    if (!name.trim()) return fail('請輸入檔名', 400);
    current = (await renameFile(id, name)) || current;
  }

  if (body.folderId !== undefined) {
    const raw = body.folderId;
    const folderId = raw === null || raw === '' ? null : raw;
    if (folderId !== null && !isUuid(folderId)) return fail('資料夾 ID 格式不正確', 400);
    if (folderId && !(await getFolder(folderId))) return fail('上層資料夾不存在', 404);
    current = (await moveFile(id, folderId)) || current;
  }

  return json({ file: fileDto(current) });
});

/** DELETE /api/files/:id — 刪除物件與資料列 */
export const DELETE = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('檔案 ID 格式不正確', 400);

  const file = await getFile(id);
  if (!file) return fail('找不到這個檔案', 404);

  if (isStorageConfigured()) {
    try {
      await deleteObject(file.object_key);
    } catch (err) {
      console.error('[storage] 刪除物件失敗', err);
      return fail('無法刪除檔案內容，請稍後再試', 502);
    }
  }

  await deleteFileRow(id);
  return json({ ok: true, id });
});