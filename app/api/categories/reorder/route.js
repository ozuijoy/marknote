import { fail, guard, isUuid, readBody, route } from '@/lib/api';
import { listCategories, moveCategory } from '@/lib/data';

/** POST /api/categories/reorder {id, direction: 'up'|'down'} */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const { id, direction } = body;
  if (!isUuid(id)) return fail('分類 ID 格式不正確', 400);
  if (direction !== 'up' && direction !== 'down') return fail('direction 只能是 up 或 down', 400);

  const moved = await moveCategory(id, direction);
  return Response.json({ ok: moved, categories: await listCategories() });
});
