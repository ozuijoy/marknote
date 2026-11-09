import { fail, guard, isUuid, route } from '@/lib/api';
import { duplicateNote } from '@/lib/data';

/** POST /api/notes/:id/duplicate — 複製一份筆記 */
export const POST = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('筆記 ID 格式不正確', 400);

  const note = await duplicateNote(id);
  if (!note) return fail('找不到這篇筆記', 404);
  return Response.json({ note }, { status: 201 });
});
