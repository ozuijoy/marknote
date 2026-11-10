import { cleanText, fail, guard, isUuid, json, readBody, route } from '@/lib/api';
import {
  deleteFolderRow,
  folderDto,
  getFolder,
  isInSubtree,
  moveFolder,
  renameFolder,
  subtreeObjectKeys,
  subtreeStats,
} from '@/lib/filedata';
import { deleteObjects } from '@/lib/storage';

export const dynamic = 'force-dynamic';

async function resolveId(ctx) {
  const params = await ctx.params;
  const id = params?.id;
  return { id, valid: isUuid(id) };
}

/** PATCH /api/folders/:id — 重新命名或移動 { name?, parentId? } */
export const PATCH = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('資料夾 ID 格式不正確', 400);

  const folder = await getFolder(id);
  if (!folder) return fail('找不到這個資料夾', 404);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  let current = folder;

  if (body.name !== undefined) {
    const name = cleanText(body.name, 80, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[/\\]/g, '·')
      .trim();
    if (!name) return fail('請輸入資料夾名稱', 400);
    current = (await renameFolder(id, name)) || current;
  }

  if (body.parentId !== undefined) {
    const raw = body.parentId;
    const parentId = raw === null || raw === '' ? null : raw;
    if (parentId !== null && !isUuid(parentId)) return fail('上層資料夾 ID 格式不正確', 400);
    if (parentId) {
      const target = await getFolder(parentId);
      if (!target) return fail('上層資料夾不存在', 404);
      if (await isInSubtree(id, parentId)) {
        return fail('不能把資料夾搬到它自己或子資料夾底下', 400);
      }
    }
    current = (await moveFolder(id, parentId)) || current;
  }

  return json({ folder: folderDto(current) });
});

/** DELETE /api/folders/:id?recursive=1 — 刪除資料夾（非空需明確 recursive） */
export const DELETE = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('資料夾 ID 格式不正確', 400);

  const folder = await getFolder(id);
  if (!folder) return fail('找不到這個資料夾', 404);

  const recursive = new URL(req.url).searchParams.get('recursive') === '1';
  const stats = await subtreeStats(id);

  if (!recursive && (stats.fileCount > 0 || stats.folderCount > 0)) {
    return fail('資料夾不是空的', 409, {
      code: 'NOT_EMPTY',
      fileCount: stats.fileCount,
      folderCount: stats.folderCount,
      totalSize: stats.totalSize,
    });
  }

  if (stats.fileCount > 0) {
    const keys = await subtreeObjectKeys(id);
    try {
      await deleteObjects(keys);
    } catch (err) {
      console.error('[storage] 刪除物件失敗', err);
      return fail('無法刪除檔案內容，請稍後再試', 502);
    }
  }

  await deleteFolderRow(id);
  return json({
    ok: true,
    deleted: { files: stats.fileCount, folders: stats.folderCount + 1, totalSize: stats.totalSize },
  });
});