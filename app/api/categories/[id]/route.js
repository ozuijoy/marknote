import { cleanText, fail, guard, isUuid, readBody, route } from '@/lib/api';
import { deleteCategory, listCategories, updateCategory } from '@/lib/data';

/** PATCH /api/categories/:id {name, emoji, color} */
export const PATCH = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('分類 ID 格式不正確', 400);

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const patch = {};
  if (body.name !== undefined) {
    patch.name = cleanText(body.name, 60, '');
    if (!patch.name) return fail('請輸入分類名稱', 400);
  }
  if (body.emoji !== undefined) patch.emoji = cleanText(body.emoji, 16, '');
  if (body.color !== undefined) patch.color = cleanText(body.color, 32, '');

  const category = await updateCategory(id, patch);
  if (!category) return fail('找不到這個分類', 404);
  return Response.json({ category, categories: await listCategories() });
});

/** DELETE /api/categories/:id（該分類下的筆記會變成「未分類」） */
export const DELETE = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('分類 ID 格式不正確', 400);

  const removed = await deleteCategory(id);
  if (!removed) return fail('找不到這個分類', 404);
  return Response.json({ ok: true, id, categories: await listCategories() });
});
