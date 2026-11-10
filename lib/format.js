/** 純函式：時間與文字格式化（client / server 共用） */

const DAY = 86400000;

/** 相對時間：剛剛／n 分鐘前／n 小時前／昨天／n 天前／日期 */
export function relativeTime(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return '';
  const diff = now - date.getTime();
  if (diff < 0) return formatDateTime(date);
  if (diff < 60_000) return '剛剛';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  if (diff < DAY) return `${Math.floor(diff / 3600_000)} 小時前`;
  if (diff < 2 * DAY) return '昨天';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return formatDate(date);
}

export function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hh}:${mm}`;
}

/** 字數統計：中日韓字元以字計，其他以單字計 */
export function countWords(text = '') {
  if (typeof text !== 'string' || !text.trim()) return { chars: 0, words: 0 };
  const cleaned = text.replace(/```[\s\S]*?```/g, (m) => m).trim();
  const cjk = (cleaned.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (cleaned
    .replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .match(/[A-Za-z0-9_'-]+/g) || []).length;
  return { chars: cleaned.length, words: cjk + latin };
}

/** 閱讀時間（分鐘），以每分鐘 300 字估算 */
export function readingTime(text = '') {
  const { words } = countWords(text);
  return Math.max(1, Math.round(words / 300));
}

/** 標籤／分類用的柔和色彩（依名稱穩定取色） */
const PALETTE = [
  { bg: 'rgba(227, 98, 98, 0.16)', fg: '#c4554d' },
  { bg: 'rgba(215, 129, 58, 0.16)', fg: '#b4692c' },
  { bg: 'rgba(159, 107, 83, 0.16)', fg: '#8d6047' },
  { bg: 'rgba(219, 171, 9, 0.16)', fg: '#9a7712' },
  { bg: 'rgba(66, 135, 245, 0.16)', fg: '#337ea9' },
  { bg: 'rgba(92, 82, 168, 0.16)', fg: '#6940a5' },
  { bg: 'rgba(115, 62, 118, 0.16)', fg: '#9065b0' },
  { bg: 'rgba(51, 126, 169, 0.16)', fg: '#337ea9' },
  { bg: 'rgba(68, 131, 92, 0.16)', fg: '#44835c' },
  { bg: 'rgba(93, 118, 62, 0.16)', fg: '#647940' },
];

export function colorFor(name = '') {
  const key = String(name).toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  return PALETTE[hash % PALETTE.length];
}

/** 位元組 → 易讀大小（B／KB／MB／GB） */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
