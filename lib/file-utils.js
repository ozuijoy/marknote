/** 檔案名稱／型別相關的純函式（伺服器與瀏覽器共用） */

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

const EXT_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  heif: 'image/heif',
};

/** 檔名清理：移除控制字元與路徑分隔線，保留副檔名 */
export function cleanFileName(value) {
  const name = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 255);
  return name || '未命名檔案';
}

/** 型別字串清理；不合法時退回 application/octet-stream */
export function cleanMime(value) {
  const mime = String(value ?? '').trim().toLowerCase();
  return MIME_RE.test(mime) ? mime.slice(0, 100) : 'application/octet-stream';
}

/** 依副檔名猜測型別（瀏覽器 file.type 常常是空字串） */
export function guessMime(name = '') {
  const ext = String(name).toLowerCase().split('.').pop();
  return EXT_MIME[ext] || 'application/octet-stream';
}

/** 是否可安全地以 inline 方式回傳（避免上傳 HTML/SVG 造成 XSS） */
export function isInlineSafe(mime = '') {
  const type = String(mime).toLowerCase();
  if (type === 'image/svg+xml') return false;
  if (type === 'text/html' || type === 'application/xhtml+xml') return false;
  return (
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type.startsWith('video/') ||
    type === 'application/pdf' ||
    type === 'text/plain'
  );
}

/** 粗略分類，供前端挑選圖示與預覽方式 */
export function mediaKind(mime = '', name = '') {
  const type = String(mime || guessMime(name)).toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'text/plain' || type === 'text/markdown' || type === 'text/csv') return 'text';
  return 'other';
}