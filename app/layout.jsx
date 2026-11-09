import './globals.css';
import { APP_NAME } from '@/lib/config';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

export const metadata = {
  title: APP_NAME,
  description: '類 Notion 的 Markdown 筆記：分類、標籤、外鏈媒體播放，資料存放於 Neon Postgres。',
  manifest: '/manifest.webmanifest',
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#191919' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" data-theme="light" suppressHydrationWarning>
      <head>
        {/* 在首次繪製前套用主題，避免深淺色閃爍 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
