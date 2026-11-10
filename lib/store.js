'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './client';
import { excerptOf, classifyMediaUrl, extractMediaUrls } from './media';
import { useLocalState } from '@/hooks';

/**
 * 工作區狀態中樞：資料載入、篩選、搜尋、選取、CRUD、自動儲存、Toast。
 * UI 元件只負責渲染與呼叫這裡的 action。
 */

const EMPTY_BOOTSTRAP = {
  appName: 'MarkNote',
  embedHosts: [],
  categories: [],
  tags: [],
  notes: [],
  archivedCount: 0,
};

export function useWorkspaceStore() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState(EMPTY_BOOTSTRAP);
  const [archivedNotes, setArchivedNotes] = useState(null);
  const [fullNotes, setFullNotes] = useState({}); // id -> 完整筆記
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState({ type: 'all', id: null });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useLocalState('mn.sort', 'updated');
  const [sidebarOpen, setSidebarOpen] = useLocalState('mn.sidebarOpen', true);
  const [mode, setMode] = useLocalState('mn.mode', 'edit'); // edit | split | read
  const [saveState, setSaveState] = useState({ state: 'idle', at: null });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const searchSeq = useRef(0);

  const notify = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 2600);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // ── 載入 ──────────────────────────────────────────────────────────────
  const load = useCallback(async ({ keepSelection = true } = {}) => {
    try {
      const payload = await api.bootstrap();
      setData({ ...EMPTY_BOOTSTRAP, ...payload });
      setArchivedNotes(null); // 下次切到封存時重新抓
      setStatus('ready');
      setLoadError('');
      if (!keepSelection) setSelectedId(null);
      return payload;
    } catch (err) {
      setStatus('error');
      setLoadError(err?.message || '載入失敗');
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── 搜尋（server-side，含內文）───────────────────────────────────────
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (!trimmedQuery) {
      setSearchResults(null);
      setSearching(false);
      return undefined;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.listNotes({ q: trimmedQuery, archived: filter.type === 'archived' });
        if (seq === searchSeq.current) {
          setSearchResults(res.notes || []);
          setSearching(false);
        }
      } catch (err) {
        if (seq === searchSeq.current) {
          setSearching(false);
          notify(err.message || '搜尋失敗', 'error');
        }
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [trimmedQuery, filter.type, notify]);

  // ── 封存列表（按需載入）──────────────────────────────────────────────
  useEffect(() => {
    if (filter.type !== 'archived' || archivedNotes !== null) return;
    let cancelled = false;
    api
      .listNotes({ archived: 'true' })
      .then((res) => {
        if (!cancelled) setArchivedNotes(res.notes || []);
      })
      .catch((err) => notify(err.message || '載入封存筆記失敗', 'error'));
    return () => {
      cancelled = true;
    };
  }, [filter.type, archivedNotes, notify]);

  // ── 可見筆記 ──────────────────────────────────────────────────────────
  const sourceNotes = useMemo(() => {
    if (trimmedQuery) return searchResults || [];
    if (filter.type === 'archived') return archivedNotes || [];
    return data.notes || [];
  }, [trimmedQuery, searchResults, filter.type, archivedNotes, data.notes]);

  const notes = useMemo(() => {
    let list = sourceNotes;
    if (filter.type === 'pinned') list = list.filter((n) => n.pinned);
    else if (filter.type === 'category') list = list.filter((n) => n.category_id === filter.id);
    else if (filter.type === 'tag') list = list.filter((n) => (n.tags || []).some((t) => t.id === filter.id));

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'title') return (a.title || '未命名').localeCompare(b.title || '未命名', 'zh-Hant');
      if (sort === 'created') return new Date(b.created_at) - new Date(a.created_at);
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
    return sorted;
  }, [sourceNotes, filter, sort]);

  const filterMeta = useMemo(() => {
    if (filter.type === 'category') {
      const c = data.categories.find((x) => x.id === filter.id);
      return { title: c ? `${c.emoji ? `${c.emoji} ` : ''}${c.name}` : '分類', subtitle: '分類' };
    }
    if (filter.type === 'tag') {
      const t = data.tags.find((x) => x.id === filter.id);
      return { title: t ? `#${t.name}` : '標籤', subtitle: '標籤' };
    }
    if (filter.type === 'pinned') return { title: '已釘選', subtitle: '檢視' };
    if (filter.type === 'archived') return { title: '已封存', subtitle: '檢視' };
    return { title: '全部筆記', subtitle: '檢視' };
  }, [filter, data.categories, data.tags]);

  // ── 選取筆記 ──────────────────────────────────────────────────────────
  const selectNote = useCallback(
    (id) => {
      setSelectedId(id);
      if (!id) return;
      setFullNotes((prev) => {
        if (prev[id]?.content !== undefined) return prev;
        // 尚未載入完整內文 → 非同步抓取
        api
          .getNote(id)
          .then((res) => setFullNotes((p) => ({ ...p, [id]: res.note })))
          .catch((err) => notify(err.message || '載入筆記失敗', 'error'));
        return prev;
      });
    },
    [notify],
  );

  const selectedNote = useMemo(() => {
    if (!selectedId) return null;
    const listItem = (data.notes || []).find((n) => n.id === selectedId)
      || (archivedNotes || []).find((n) => n.id === selectedId)
      || (searchResults || []).find((n) => n.id === selectedId);
    const full = fullNotes[selectedId];
    if (full) return { ...listItem, ...full };
    return listItem ? { ...listItem, content: undefined } : null;
  }, [selectedId, data.notes, archivedNotes, searchResults, fullNotes]);

  // ── 本地合併（避免每次自動儲存都重抓全部資料）───────────────────────
  const mergeNote = useCallback((note, { content } = {}) => {
    if (!note?.id) return;
    const body = content !== undefined ? content : note.content;
    const patch = {
      id: note.id,
      title: note.title ?? '',
      pinned: Boolean(note.pinned),
      archived: Boolean(note.archived),
      category_id: note.category_id ?? null,
      tags: Array.isArray(note.tags) ? note.tags : [],
      updated_at: note.updated_at || new Date().toISOString(),
    };
    if (typeof body === 'string') {
      const media = extractMediaUrls(body).filter((u) => classifyMediaUrl(u, []));
      patch.excerpt = excerptOf(body, 140);
      patch.has_media = media.length > 0;
      patch.content_length = body.length;
    }
    setData((prev) => {
      const idx = prev.notes.findIndex((n) => n.id === patch.id);
      const nextNotes = [...prev.notes];
      if (idx >= 0) nextNotes[idx] = { ...nextNotes[idx], ...patch };
      else if (!patch.archived) nextNotes.unshift({ ...patch, created_at: patch.updated_at, content_head: '' });
      else nextNotes.push({ ...patch, created_at: patch.updated_at, content_head: '' });
      return { ...prev, notes: nextNotes.filter((n) => !n.archived) };
    });
    setArchivedNotes((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((n) => n.id === patch.id);
      if (patch.archived) {
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...patch };
          return next;
        }
        return [{ ...patch, created_at: patch.updated_at, content_head: '' }, ...prev];
      }
      if (idx < 0) return prev;
      return prev.filter((n) => n.id !== patch.id);
    });
    setFullNotes((prev) => ({
      ...prev,
      [patch.id]: { ...(prev[patch.id] || {}), ...note, ...(body !== undefined ? { content: body } : {}) },
    }));
  }, []);

  // ── CRUD actions ─────────────────────────────────────────────────────
  const run = useCallback(
    async (fn, { errorMessage } = {}) => {
      try {
        setSaveState({ state: 'saving', at: Date.now() });
        const result = await fn();
        setSaveState({ state: 'saved', at: Date.now() });
        return result;
      } catch (err) {
        console.error('[store] 操作失敗', err);
        setSaveState({ state: 'error', at: Date.now() });
        notify(errorMessage || err.message || '操作失敗', 'error');
        if (err instanceof ApiError && err.status === 401) return null;
        return null;
      }
    },
    [notify],
  );

  const createNote = useCallback(
    async ({ categoryId = null, tagNames = [] } = {}) => {
      setSaveState({ state: 'idle', at: null });
      const res = await run(
        () => api.createNote({
          title: '',
          content: '',
          categoryId: categoryId ?? (filter.type === 'category' ? filter.id : null),
          tagNames: tagNames.length ? tagNames : filter.type === 'tag' ? [data.tags.find((t) => t.id === filter.id)?.name].filter(Boolean) : [],
        }),
        { errorMessage: '建立筆記失敗' },
      );
      if (!res?.note) return null;
      mergeNote(res.note, { content: res.note.content });
      setSelectedId(res.note.id);
      setMode('edit');
      setSaveState({ state: 'idle', at: null });
      return res.note;
    },
    [run, mergeNote, filter, data.tags, setMode],
  );

  const saveNote = useCallback(
    async (id, patch) => {
      const res = await run(() => api.updateNote(id, patch), { errorMessage: '儲存失敗' });
      if (!res?.note) return null;
      mergeNote(res.note, { content: patch.content });
      return res.note;
    },
    [run, mergeNote],
  );

  const removeNote = useCallback(
    async (id) => {
      const res = await run(() => api.deleteNote(id), { errorMessage: '刪除失敗' });
      if (!res) return false;
      setData((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }));
      setArchivedNotes((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
      setFullNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSelectedId((cur) => (cur === id ? null : cur));
      notify('筆記已刪除', 'success');
      return true;
    },
    [run, notify],
  );

  const duplicateNote = useCallback(
    async (id) => {
      const res = await run(() => api.duplicateNote(id), { errorMessage: '複製失敗' });
      if (!res?.note) return null;
      mergeNote(res.note, { content: res.note.content });
      setSelectedId(res.note.id);
      notify('已建立副本', 'success');
      return res.note;
    },
    [run, mergeNote, notify],
  );

  const togglePin = useCallback(
    (note) => saveNote(note.id, { pinned: !note.pinned }).then((res) => {
      if (res) notify(res.pinned ? '已釘選' : '已取消釘選', 'success');
      return res;
    }),
    [saveNote, notify],
  );

  const toggleArchive = useCallback(
    (note) => saveNote(note.id, { archived: !note.archived }).then((res) => {
      if (res) {
        notify(res.archived ? '已移入封存' : '已還原筆記', 'success');
        setData((prev) => ({
          ...prev,
          archivedCount: Math.max(0, prev.archivedCount + (res.archived ? 1 : -1)),
        }));
      }
      return res;
    }),
    [saveNote, notify],
  );

  const moveNoteToCategory = useCallback(
    (noteId, categoryId) => saveNote(noteId, { categoryId: categoryId || '' }),
    [saveNote],
  );

  const setNoteTags = useCallback((noteId, tagNames) => saveNote(noteId, { tagNames }), [saveNote]);

  // ── 分類 ─────────────────────────────────────────────────────────────
  const addCategory = useCallback(
    async ({ name, emoji = '', color = '' }) => {
      const res = await run(() => api.createCategory({ name, emoji, color }), { errorMessage: '建立分類失敗' });
      if (!res?.category) return null;
      await load();
      setFilter({ type: 'category', id: res.category.id });
      notify('已建立分類', 'success');
      return res.category;
    },
    [run, load, notify],
  );

  const renameCategory = useCallback(
    async (id, patch) => {
      const res = await run(() => api.updateCategory(id, patch), { errorMessage: '更新分類失敗' });
      if (!res) return null;
      setData((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...res.category } : c)),
      }));
      return res.category;
    },
    [run],
  );

  const removeCategory = useCallback(
    async (id) => {
      const res = await run(() => api.deleteCategory(id), { errorMessage: '刪除分類失敗' });
      if (!res) return false;
      await load();
      setFilter((cur) => (cur.type === 'category' && cur.id === id ? { type: 'all', id: null } : cur));
      notify('分類已刪除，其下筆記改為未分類', 'success');
      return true;
    },
    [run, load, notify],
  );

  const moveCategory = useCallback(
    async (id, direction) => {
      const res = await run(() => api.reorderCategory(id, direction), { errorMessage: '調整順序失敗' });
      if (!res) return false;
      setData((prev) => ({ ...prev, categories: res.categories || prev.categories }));
      return true;
    },
    [run],
  );

  // ── 標籤 ─────────────────────────────────────────────────────────────
  const addTag = useCallback(
    async ({ name, color = '' }) => {
      const res = await run(() => api.createTag({ name, color }), { errorMessage: '建立標籤失敗' });
      if (!res) return null;
      setData((prev) => ({ ...prev, tags: res.tags || prev.tags }));
      return res.tag;
    },
    [run],
  );

  const renameTag = useCallback(
    async (id, patch) => {
      const res = await run(() => api.updateTag(id, patch), { errorMessage: '更新標籤失敗' });
      if (!res) return null;
      setData((prev) => ({ ...prev, tags: res.tags || prev.tags }));
      return res.tag;
    },
    [run],
  );

  const removeTag = useCallback(
    async (id) => {
      const res = await run(() => api.deleteTag(id), { errorMessage: '刪除標籤失敗' });
      if (!res) return false;
      setData((prev) => ({ ...prev, tags: res.tags || prev.tags }));
      setFilter((cur) => (cur.type === 'tag' && cur.id === id ? { type: 'all', id: null } : cur));
      notify('標籤已刪除', 'success');
      return true;
    },
    [run, notify],
  );

  const refresh = useCallback(async () => {
    await load();
    notify('已重新整理', 'success');
  }, [load, notify]);

  return {
    // 狀態
    status,
    loadError,
    appName: data.appName,
    embedHosts: data.embedHosts || [],
    categories: data.categories || [],
    tags: data.tags || [],
    notes,
    allNotesCount: (data.notes || []).length,
    archivedCount: data.archivedCount || 0,
    pinnedCount: (data.notes || []).filter((n) => n.pinned).length,
    filter,
    filterMeta,
    query,
    searching,
    sort,
    sidebarOpen,
    mode,
    selectedId,
    selectedNote,
    saveState,
    toast,
    // setters
    setFilter,
    setQuery,
    setSort,
    setSidebarOpen,
    setMode,
    selectNote,
    notify,
    dismissToast,
    setSaveState,
    // actions
    load,
    refresh,
    createNote,
    saveNote,
    removeNote,
    duplicateNote,
    togglePin,
    toggleArchive,
    moveNoteToCategory,
    setNoteTags,
    addCategory,
    renameCategory,
    removeCategory,
    moveCategory,
    addTag,
    renameTag,
    removeTag,
  };
}
