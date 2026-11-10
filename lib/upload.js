'use client';

import { api } from './client';
import { guessMime, mediaKind } from './file-utils';

/** 從 S3 的 XML 錯誤訊息中取出可讀原因 */
function s3ErrorMessage(text, status) {
  const code = /<Code>([^<]+)<\/Code>/.exec(text || '')?.[1];
  const message = /<Message>([^<]+)<\/Message>/.exec(text || '')?.[1];
  if (code === 'EntityTooLarge') return '檔案超過伺服器允許的大小';
  if (code === 'SignatureDoesNotMatch') return '上傳授權失效，請重新整理後再試';
  return message || code || `上傳失敗（HTTP ${status}）`;
}

function putWithProgress(url, file, headers, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [key, value] of Object.entries(headers || {})) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(s3ErrorMessage(xhr.responseText, xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error('網路中斷，上傳失敗'));
    xhr.onabort = () => reject(Object.assign(new Error('上傳已取消'), { name: 'AbortError' }));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/**
 * 上傳單一檔案：取得 presigned URL → 直接 PUT 到 bucket → 登記中介資料。
 * @param {File} file
 * @param {{folderId?: string|null, onProgress?: (ratio:number)=>void, signal?: AbortSignal}} opts
 */
export async function uploadFile(file, { folderId = null, onProgress, signal } = {}) {
  const mime = file.type || guessMime(file.name);
  const ticket = await api.uploadUrl({ name: file.name, mime, size: file.size, folderId });
  await putWithProgress(ticket.uploadUrl, file, ticket.headers, { onProgress, signal });
  onProgress?.(1);
  const res = await api.registerFile({
    key: ticket.key,
    name: ticket.name || file.name,
    mime: ticket.mime || mime,
    size: file.size,
    folderId,
  });
  return res.file;
}

/** 依檔案型別產生要插入筆記的 Markdown 片段 */
export function snippetForFile(file) {
  const url = file.rawUrl;
  const label = String(file.name || '檔案').replace(/([\[\]])/g, '\\$1');
  switch (mediaKind(file.mime, file.name)) {
    case 'image':
      return `![${label}](${url})`;
    case 'audio':
      return `<audio controls src="${url}"></audio>`;
    case 'video':
      return `<video controls src="${url}"></video>`;
    default:
      return `[${label}](${url})`;
  }
}