import { cleanText, fail, guard, isUuid, json, readBody, route } from '@/lib/api';
import { createFolder, folderDto, getFolder, listFolders, storageStats } from '@/lib/filedata';

export const dynamic = 'force-dynamic';

function cleanName(value) {
  return cleanText(value, 80, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '·')
    .trim();
}

function cleanParent(value) {
  if (value === undefined || value === null || value === '') return { parentId: null, ok: true };
  if (!isUuid(value)) return { ok: false };
  return { parentId: value, ok: true };
}

/** GET /api/folders — 所有資料夾（前端自行組成樹）＋整體用量 */
export const GET = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const [rows, stats] = await Promise.all([listFolders(), storageStats()]);
  return json({ folders: rows.map(folderDto), stats });
});

/** POST /api/folders — 新增資料夾 { name, parentId? } */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const name = cleanName(body.name);
  if (!name) return fail('請輸入資料夾名稱', 400);

  const parent = cleanParent(body.parentId);
  if (!parent.ok) return fail('上層資料夾 ID 格式不正確', 400);
  if (parent.parentId) {
    const parentFolder = await getFolder(parent.parentId);
    if (!parentFolder) return fail('上層資料夾不存在', 404);
  }

  const folder = await createFolder({ name, parentId: parent.parentId });
  return json({ folder: folderDto(folder) }, { status: 201 });
});