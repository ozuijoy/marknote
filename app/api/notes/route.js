import { cleanText, fail, guard, isUuid, readBody, route } from '@/lib/api';
import { createNote, listNotes, searchNotes } from '@/lib/data';

/** GET /api/notes?q=&archived=&categoryId=&tagId= */
export const GET = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const archived = url.searchParams.get('archived') === 'true';
  const categoryId = url.searchParams.get('categoryId') || '';
  const tagId = url.searchParams.get('tagId') || '';

  if (q) {
    const notes = await searchNotes(q, { archived });
    return Response.json({ notes, query: q });
  }

  const notes = await listNotes({
    archived,
    categoryId: categoryId && isUuid(categoryId) ? categoryId : null,
    tagId: tagId && isUuid(tagId) ? tagId : null,
  });
  return Response.json({ notes });
});

/** POST /api/notes {title, content, categoryId, tagNames, pinned} */
export const POST = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const body = await readBody(req);
  if (!body) return fail('請求內容不是合法的 JSON', 400);

  const categoryId = cleanText(body.categoryId, 64, '');
  if (categoryId && !isUuid(categoryId)) return fail('分類格式不正確', 400);

  const note = await createNote({
    title: cleanText(body.title, 500, ''),
    content: body.content === undefined ? '' : String(body.content),
    categoryId: categoryId || null,
    tagNames: Array.isArray(body.tagNames) ? body.tagNames : [],
    pinned: body.pinned === true,
  });
  return Response.json({ note }, { status: 201 });
});
