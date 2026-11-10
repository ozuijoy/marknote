'use client';

/** 瀏覽器端 API 呼叫：統一錯誤處理與 session 失效導向 */

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('網路連線失敗，請檢查網路狀態', 0, null);
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 300) };
    }
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      // session 失效：回到登入頁（保留目前路徑）
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?expired=1&next=${encodeURIComponent(next)}`;
      throw new ApiError('登入已失效，正在導向登入頁…', 401, payload);
    }
    throw new ApiError(payload?.error || `請求失敗（HTTP ${res.status}）`, res.status, payload);
  }
  return payload;
}

export const api = {
  login: (password) => apiFetch('/api/auth/login', { method: 'POST', body: { password } }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  bootstrap: (signal) => apiFetch('/api/bootstrap', { signal }),
  listNotes: (params = {}, signal) =>
    apiFetch(`/api/notes?${new URLSearchParams(params).toString()}`, { signal }),
  getNote: (id, signal) => apiFetch(`/api/notes/${id}`, { signal }),
  createNote: (payload) => apiFetch('/api/notes', { method: 'POST', body: payload }),
  updateNote: (id, payload) => apiFetch(`/api/notes/${id}`, { method: 'PATCH', body: payload }),
  deleteNote: (id) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
  duplicateNote: (id) => apiFetch(`/api/notes/${id}/duplicate`, { method: 'POST' }),
  createCategory: (payload) => apiFetch('/api/categories', { method: 'POST', body: payload }),
  updateCategory: (id, payload) => apiFetch(`/api/categories/${id}`, { method: 'PATCH', body: payload }),
  deleteCategory: (id) => apiFetch(`/api/categories/${id}`, { method: 'DELETE' }),
  reorderCategory: (id, direction) => apiFetch('/api/categories/reorder', { method: 'POST', body: { id, direction } }),
  createTag: (payload) => apiFetch('/api/tags', { method: 'POST', body: payload }),
  updateTag: (id, payload) => apiFetch(`/api/tags/${id}`, { method: 'PATCH', body: payload }),
  deleteTag: (id) => apiFetch(`/api/tags/${id}`, { method: 'DELETE' }),

  // ── 檔案庫 ────────────────────────────────────────────────────────────
  storageStatus: (signal) => apiFetch('/api/storage', { signal }),
  listFolders: (signal) => apiFetch('/api/folders', { signal }),
  createFolder: (payload) => apiFetch('/api/folders', { method: 'POST', body: payload }),
  updateFolder: (id, payload) => apiFetch(`/api/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteFolder: (id, { recursive = false } = {}) =>
    apiFetch(`/api/folders/${id}${recursive ? '?recursive=1' : ''}`, { method: 'DELETE' }),
  listFiles: (folderId, signal) =>
    apiFetch(`/api/files${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`, { signal }),
  uploadUrl: (payload) => apiFetch('/api/files/upload-url', { method: 'POST', body: payload }),
  registerFile: (payload) => apiFetch('/api/files', { method: 'POST', body: payload }),
  updateFile: (id, payload) => apiFetch(`/api/files/${id}`, { method: 'PATCH', body: payload }),
  deleteFile: (id) => apiFetch(`/api/files/${id}`, { method: 'DELETE' }),
};
