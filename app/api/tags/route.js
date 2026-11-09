import { cleanText, fail, guard, readBody, route } from '@/lib/api';
import { createTag, listTags } from '@/lib/data';

/** POST /api/tags {name, color} */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const name = cleanText(body.name, 40, '').replace(/^#/, '');
  if (!name) return fail('請輸入標籤名稱', 400);

  const tag = await createTag({ name, color: cleanText(body.color, 32, '') });
  if (!tag) return fail('建立標籤失敗', 500);
  return Response.json({ tag, tags: await listTags() }, { status: 201 });
});
