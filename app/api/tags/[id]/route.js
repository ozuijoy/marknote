import { cleanText, fail, guard, isUuid, readBody, route } from '@/lib/api';
import { deleteTag, listTags, updateTag } from '@/lib/data';

/** PATCH /api/tags/:id {name, color} */
export const PATCH = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('標籤 ID 格式不正確', 400);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const patch = {};
  if (body.name !== undefined) {
    patch.name = cleanText(body.name, 40, '').replace(/^#/, '');
    if (!patch.name) return fail('請輸入標籤名稱', 400);
  }
  if (body.color !== undefined) patch.color = cleanText(body.color, 32, '');

  const tag = await updateTag(id, patch);
  if (!tag) return fail('找不到這個標籤', 404);
  return Response.json({ tag, tags: await listTags() });
});

/** DELETE /api/tags/:id（同時移除所有筆記上的該標籤） */
export const DELETE = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('標籤 ID 格式不正確', 400);

  const removed = await deleteTag(id);
  if (!removed) return fail('找不到這個標籤', 404);
  return Response.json({ ok: true, id, tags: await listTags() });
});
