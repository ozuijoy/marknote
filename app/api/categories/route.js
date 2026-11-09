import { cleanText, fail, guard, readBody, route } from '@/lib/api';
import { createCategory, listCategories } from '@/lib/data';

/** GET /api/categories */
export const GET = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json({ categories: await listCategories() });
});

/** POST /api/categories {name, emoji, color} */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const name = cleanText(body.name, 60, '');
  if (!name) return fail('請輸入分類名稱', 400);

  const category = await createCategory({
    name,
    emoji: cleanText(body.emoji, 16, ''),
    color: cleanText(body.color, 32, ''),
  });
  if (!category) return fail('建立分類失敗', 500);
  return Response.json({ category }, { status: 201 });
});
