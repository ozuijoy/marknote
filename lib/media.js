import { defaultSchema } from 'rehype-sanitize';

/**
 * 純函式：判斷外鏈媒體類型、解析影音内嵌、產生 sanitize schema。
 * 不使用任何 Node/瀏覽器專屬 API，因此 client 與 server 都能 import，也方便單元測試。
 */

export const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'heic', 'heif', 'tif', 'tiff',
];

export const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'weba', 'mpga',
];

export const VIDEO_EXTENSIONS = [
  'mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'mpg', 'mpeg',
];

const EMBED_PROVIDERS = {
  youtube: { label: 'YouTube', ratio: '16 / 9' },
  vimeo: { label: 'Vimeo', ratio: '16 / 9' },
  bilibili: { label: 'Bilibili', ratio: '16 / 9' },
};

/** 安全解析 URL；失敗回傳 null */
export function parseUrl(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value, 'http://invalid.local');
  } catch {
    return null;
  }
}

/** 取出副檔名（不含點，小寫，忽略 query/hash） */
export function extensionOf(raw) {
  const url = parseUrl(raw);
  if (!url) return '';
  const path = url.pathname || '';
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  return match ? match[1].toLowerCase() : '';
}

/**
 * 依網址判斷媒體類型。
 * @returns {'image'|'audio'|'video'|'embed'|null}
 */
export function classifyMediaUrl(raw, embedHosts = []) {
  const url = parseUrl(raw);
  if (!url) return null;
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;

  const ext = extensionOf(raw);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (resolveEmbed(raw, embedHosts)) return 'embed';
  return null;
}

/** 網址是否可安全渲染（只允許 http/https，以及圖片用的 data:image/*） */
export function isSafeMediaUrl(raw, { allowDataImage = false } = {}) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return false;
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(value)) {
    return true;
  }
  const url = parseUrl(value);
  if (!url) return false;
  const protocol = url.protocol.toLowerCase();
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * 解析 YouTube / Vimeo / Bilibili 網址為可内嵌的 player 網址。
 * @returns {{provider: string, label: string, src: string, ratio: string, id: string}|null}
 */
export function resolveEmbed(raw, embedHosts = []) {
  const url = parseUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const allow = new Set(embedHosts.map((h) => h.toLowerCase().replace(/^www\./, '')));
  /** 任一相關網域在白名單即放行（例如 player.vimeo.com 或 vimeo.com） */
  const allowed = (...candidates) => candidates.some((c) => allow.has(c.replace(/^www\./, '')));

  // YouTube
  let id = '';
  if (host === 'youtu.be') {
    id = url.pathname.replace(/^\//, '').split('/')[0] || '';
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = url.searchParams.get('v');
    if (v) id = v;
    const parts = url.pathname.split('/').filter(Boolean); // embed/<id> | shorts/<id> | live/<id>
    if (!id && ['embed', 'shorts', 'live'].includes(parts[0]) && parts[1]) id = parts[1];
  }
  if (id && allowed('youtube.com', 'youtube-nocookie.com', 'youtu.be')) {
    const start = url.searchParams.get('t') || url.searchParams.get('start');
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (start) params.set('start', String(start).replace(/[^\d]/g, ''));
    return {
      provider: 'youtube',
      label: EMBED_PROVIDERS.youtube.label,
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`,
      ratio: EMBED_PROVIDERS.youtube.ratio,
      id,
    };
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const numeric = parts.find((p) => /^\d+$/.test(p));
    if (numeric && allowed('vimeo.com', 'player.vimeo.com')) {
      return {
        provider: 'vimeo',
        label: EMBED_PROVIDERS.vimeo.label,
        src: `https://player.vimeo.com/video/${numeric}`,
        ratio: EMBED_PROVIDERS.vimeo.ratio,
        id: numeric,
      };
    }
  }

  // Bilibili（BV 番号或 av 番号）
  if (host === 'bilibili.com' || host === 'www.bilibili.com' || host === 'm.bilibili.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const bv = parts.find((p) => /^(BV|av)[\w]+$/i.test(p));
    if (bv && allowed('bilibili.com', 'player.bilibili.com')) {
      const page = url.searchParams.get('p') || '1';
      const key = /^bv/i.test(bv) ? `bvid=${bv}` : `aid=${bv.replace(/^av/i, '')}`;
      return {
        provider: 'bilibili',
        label: EMBED_PROVIDERS.bilibili.label,
        src: `https://player.bilibili.com/player.html?${key}&page=${encodeURIComponent(page)}&high_quality=1&danmaku=0`,
        ratio: EMBED_PROVIDERS.bilibili.ratio,
        id: bv,
      };
    }
  }

  return null;
}

/** Markdown 內容裡出現的媒體網址（用於筆記列表顯示「含媒體」徽章與快速預覽） */
export function extractMediaUrls(markdown = '') {
  const found = [];
  if (typeof markdown !== 'string' || !markdown) return found;
  const patterns = [
    /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?[^)]*\)/g, // ![alt](url)
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<(?:audio|video|source)[^>]+src=["']([^"']+)["']/gi,
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /(^|[\s(])(https?:\/\/[^\s<>()"']+)/g, // 裸網址
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(markdown)) !== null) {
      // 不同 pattern 的捕獲群位置不同，取最後一個非空群組
      const url = (m.findLast?.((g) => typeof g === 'string' && g.trim()) ?? m[1] ?? '').trim();
      if (url && !found.includes(url)) found.push(url);
      if (m.index === re.lastIndex) re.lastIndex += 1; // 避免零長度匹配造成無限迴圈
    }
  }
  return found;
}

/** 筆記內文的純文字摘要（用於列表顯示） */
export function excerptOf(markdown = '', length = 160) {
  if (typeof markdown !== 'string' || !markdown) return '';
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 程式碼區塊
    .replace(/`[^`]*`/g, ' ') // 行內程式碼
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 圖片
    .replace(/<[^>]+>/g, ' ') // HTML 標籤（含媒體）
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 連結保留顯示文字
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // 粗體
    .replace(/\*(?!\s)(.+?)\*/g, '$1') // 斜體（*）
    .replace(/(?<![\w])_(?!\s)(.+?)_(?![\w])/g, '$1') // 斜體（_）
    .replace(/~~(.+?)~~/g, '$1') // 刪除線
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 標題記號
    .replace(/^\s*>\s?/gm, '') // 引用
    .replace(/^\s*(?:-\s)?\[[ xX]\]\s*/gm, '') // 待辦框
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '') // 清單記號
    .replace(/\|/g, ' ') // 表格線
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

/**
 * 產生 rehype-sanitize 用的 schema：
 * 預設 schema 會把 <img> 以外的媒體全部剥掉，這裡在白名單內放行
 * 圖片／音訊／影片／字幕軌／受信任的 iframe，並保留程式碼區塊的 class。
 */
export function buildSanitizeSchema() {
  return {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      'audio', 'video', 'source', 'track', 'iframe', 'figure', 'figcaption',
      'details', 'summary', 'input', 'mark', 'kbd', 'ins', 'del', 'span',
    ],
    attributes: {
      ...defaultSchema.attributes,
      '*': [...((defaultSchema.attributes || {})['*'] || [])],
      a: [...(((defaultSchema.attributes || {}).a) || []), 'target', 'rel', 'title'],
      img: [
        ...(((defaultSchema.attributes || {}).img) || []),
        'src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'srcSet', 'sizes', 'referrerPolicy',
      ],
      audio: ['src', 'controls', 'preload', 'loop', 'muted'],
      video: ['src', 'controls', 'preload', 'poster', 'width', 'height', 'loop', 'muted', 'playsInline'],
      source: ['src', 'srcSet', 'type', 'media', 'sizes'],
      track: ['src', 'kind', 'srcLang', 'label', 'default'],
      iframe: ['src', 'width', 'height', 'title', 'loading', 'allow', 'allowFullScreen', 'frameBorder', 'referrerPolicy', 'sandbox'],
      input: ['type', 'checked', 'disabled'],
      code: ['className'],
      span: ['className'],
      pre: ['className'],
      th: ['align', 'colSpan', 'rowSpan'],
      td: ['align', 'colSpan', 'rowSpan'],
      div: ['className', 'dataMedia'],
    },
    protocols: {
      ...defaultSchema.protocols,
      src: ['http', 'https'],
      srcSet: ['http', 'https'],
      poster: ['http', 'https'],
      href: ['http', 'https', 'mailto', 'tel'],
    },
    // 自訂檢查：iframe 只放行白名單網域
    allowComments: false,
    clobberPrefix: 'user-content-',
    ancestors: {
      ...(defaultSchema.ancestors || {}),
      li: ['ul', 'ol'],
      source: ['audio', 'video', 'picture'],
      track: ['audio', 'video'],
    },
  };
}

/** iframe 白名單檢查（MarkdownView 渲染時使用） */
export function isAllowedEmbedHost(raw, embedHosts = []) {
  const url = parseUrl(raw);
  if (!url) return false;
  if (url.protocol.toLowerCase() !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  const allow = embedHosts.map((h) => h.toLowerCase().trim()).filter(Boolean);
  if (allow.length === 0) return false;
  return allow.some((entry) => host === entry || host.endsWith(`.${entry}`));
}
