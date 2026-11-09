import { NextResponse } from 'next/server';
import { getSessionCookieName } from './lib/config';
import { verifySessionToken } from './lib/session';

const PUBLIC_API = /^\/api\/(health|session|auth\/(login|logout))$/;

/**
 * 全站守衛：未登入導向 /login，API 回 401。
 * 使用 Edge Runtime，只做 JWT 驗證，不碰資料庫。
 */
export async function middleware(req) {
  const { pathname, search } = req.nextUrl;

  // 不需登入即可存取的端點：
  // - /api/health  部署健康檢查（不回傳任何筆記資料）
  // - /api/auth/*  登入／登出
  // - /api/session 前端用來確認登入狀態
  if (PUBLIC_API.test(pathname)) return NextResponse.next();

  const token = req.cookies.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);

  if (pathname.startsWith('/login')) {
    if (session) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '尚未登入或 session 已過期' }, { status: 401 });
  }

  const url = new URL('/login', req.url);
  if (pathname !== '/' || search) url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // 靜態資源與 Next 內部路徑不進 middleware
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)'],
};
