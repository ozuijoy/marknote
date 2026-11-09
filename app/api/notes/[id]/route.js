import { cleanText, fail, guard, isUuid, readBody, route } from '@/lib/api';
import { deleteNote, getNote, updateNote } from '@/lib/data';

async function resolveId(ctx) {
  const params = await ctx.params;
  const id = params?.id;
  return { id, valid: isUuid(id) };
}

/** GET /api/notes/:id — 完整內文 */
export const GET = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('筆記 ID 格式不正確', 400);

  const note = await getNote(id);
  if (!note) return fail('找不到這篇筆記', 404);
  return Response.json({ note });
});

/** PATCH /api/notes/:id — 部分更新（自動儲存用） */
export const PATCH = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('筆記 ID 格式不正確', 400);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const patch = {};
  if (body.title !== undefined) patch.title = cleanText(body.title, 500, '');
  if (body.content !== undefined) patch.content = String(body.content);
  if (body.pinned !== undefined) patch.pinned = body.pinned === true;
  if (body.archived !== undefined) patch.archived = body.archived === true;
  if (body.categoryId !== undefined) {
    const categoryId = cleanText(body.categoryId, 64, '');
    if (categoryId && !isUuid(categoryId)) return fail('分類格式不正確', 400);
    patch.categoryId = categoryId || null;
  }
  if (body.tagNames !== undefined) {
    if (!Array.isArray(body.tagNames)) return fail('tagNames 必須是陣列', 400);
    patch.tagNames = body.tagNames;
  }

  const existing = await getNote(id);
  if (!existing) return fail('找不到這篇筆記', 404);

  const note = await updateNote(id, patch);
  return Response.json({ note });
});

/** DELETE /api/notes/:id */
export const DELETE = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const { id, valid } = await resolveId(ctx);
  if (!valid) return fail('筆記 ID 格式不正確', 400);

  const removed = await deleteNote(id);
  if (!removed) return fail('找不到這篇筆記', 404);
  return Response.json({ ok: true, id });
});
