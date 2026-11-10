import { fail, guard, isUuid, route } from '@/lib/api';
import { isStorageConfigured } from '@/lib/config';
import { isInlineSafe } from '@/lib/file-utils';
import { getFile } from '@/lib/filedata';
import { presignDownload } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/files/:id/raw — 以 session 驗證後轉址到短效 presigned URL。
 * 筆記內文直接引用這個路徑，因此網址穩定、可被 <img>/<audio>/<video> 使用。
 */
export const GET = route(async (req, ctx) => {
  const denied = await guard(req);
  if (denied) return denied;

  const params = await ctx.params;
  const id = params?.id;
  if (!isUuid(id)) return fail('檔案 ID 格式不正確', 400);

  if (!isStorageConfigured()) return fail('尚未設定物件儲存，檔案庫無法使用', 503);

  const file = await getFile(id);
  if (!file) return fail('找不到這個檔案', 404);

  const download = new URL(req.url).searchParams.get('download') === '1';
  // 一律走 presigned URL；不支援 inline 的型別強制下載，避免上傳 HTML/SVG 造成 XSS
  const asAttachment = download || !isInlineSafe(file.mime);

  let target;
  try {
    target = await presignDownload({ key: file.object_key, filename: file.name, download: asAttachment });
  } catch (err) {
    console.error('[storage] 產生下載網址失敗', err);
    return fail('物件儲存暫時無法使用，請稍後再試', 502);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});