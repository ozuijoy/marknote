import { APP_NAME } from '@/lib/config';

/** PWA manifest：可「加到主畫面」以全螢幕開啟 */
export default function manifest() {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: '類 Notion 的 Markdown 筆記工作區',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'zh-Hant',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
