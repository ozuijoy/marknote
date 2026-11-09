import { fail, guard, route } from '@/lib/api';
import { APP_NAME, getEmbedAllowlist } from '@/lib/config';
import { listCategories, listNotes, listTags } from '@/lib/data';

/**
 * 一次取回工作區所需的全部中繼資料：分類、標籤、筆記清單（不含完整內文）。
 * 行動端與桌面端共用，減少 round trip。
 */
export const GET = route(async (req) => {
  const denied = await guard(req);
  if (denied) return denied;

  const [categories, tags, notes, archived] = await Promise.all([
    listCategories(),
    listTags(),
    listNotes({ archived: false }),
    listNotes({ archived: true }),
  ]);

  if (!notes || !categories || !tags) {
    return fail('資料庫查詢失敗', 500);
  }

  return Response.json({
    appName: APP_NAME,
    embedHosts: getEmbedAllowlist(),
    categories,
    tags,
    notes,
    archivedCount: archived.length,
  });
});
