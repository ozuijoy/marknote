'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';
import { Menu, PromptDialog } from './Modal';
import MarkdownView from './MarkdownView';
import TagPicker from './TagPicker';
import { countWords, formatDateTime, readingTime } from '@/lib/format';
import { snippetForFile, uploadFile } from '@/lib/upload';

/**
 * 右欄：編輯／閱讀區。
 * 三種顯示模式：編輯、並排（左編輯右預覽）、閱讀。
 * 內建 Markdown 工具列、快捷鍵、清單自動延續與防抖自動儲存。
 */

const PREFIX_RE = /^(\s*)(?:-\s\[[ xX]\]\s|>\s?|[-*+]\s|\d+[.)]\s)/;
const AUTOSAVE_DELAY = 900;

export default function NoteEditor({ store, variant = 'desktop', onBack, onRequestDelete, onToggleSidebar }) {
  const note = store.selectedNote;
  const noteId = note?.id ?? null;
  const { mode, setMode, saveState, embedHosts, categories } = store;
  const isMobile = variant === 'mobile';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef(null);
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const draftRef = useRef({ id: null, title: '', content: '', dirty: false });
  // store 每次 render 都是新物件，用 ref 固定引用，避免自動存排的 debounce 一直被重置
  const storeRef = useRef(store);
  storeRef.current = store;

  // ── 載入草稿 ──────────────────────────────────────────────────────────
  const contentReady = note?.content !== undefined;
  useEffect(() => {
    const next = { id: noteId, title: note?.title || '', content: note?.content || '', dirty: false };
    draftRef.current = next;
    setTitle(next.title);
    setContent(next.content);
    setDirty(false);
    // 只在「切換筆記」或「內容首次載入完成」時重置草稿，避免打字中游標跳動
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, contentReady]);

  // ── 儲存 ──────────────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    const draft = draftRef.current;
    if (!draft.id || !draft.dirty) return null;
    draft.dirty = false;
    setDirty(false);
    return storeRef.current.saveNote(draft.id, { title: draft.title, content: draft.content });
  }, []);

  useEffect(() => {
    if (!dirty || !noteId) return undefined;
    const timer = setTimeout(flushSave, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, title, content, noteId]);

  // 離開元件時把未儲存的內容送出
  useEffect(() => () => {
    if (draftRef.current.dirty) flushSave();
  }, [flushSave]);

  const updateDraft = useCallback((patch) => {
    draftRef.current = { ...draftRef.current, ...patch, dirty: true };
    setDirty(true);
  }, []);

  // ── 文字編輯輔助 ──────────────────────────────────────────────────────
  const applyTransform = useCallback(
    (fn) => {
      const el = editorRef.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const out = fn(value, s, e);
      if (!out) return;
      setContent(out.text);
      updateDraft({ content: out.text });
      requestAnimationFrame(() => {
        el.focus();
        const start = out.start ?? s;
        const end = out.end ?? start;
        el.setSelectionRange(start, end);
      });
    },
    [updateDraft],
  );

  const wrap = useCallback(
    (before, after = before, placeholder = '') =>
      applyTransform((v, s, e) => {
        const sel = v.slice(s, e) || placeholder;
        const text = v.slice(0, s) + before + sel + after + v.slice(e);
        return { text, start: s + before.length, end: s + before.length + sel.length };
      }),
    [applyTransform],
  );

  const insertBlock = useCallback(
    (block, caretOffset = null) =>
      applyTransform((v, s, e) => {
        const before = v.slice(0, s);
        const after = v.slice(e);
        const gap = before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
        const tail = after.startsWith('\n') || after === '' ? '' : '\n';
        const text = `${before}${gap}${block}${tail}${after}`;
        const caret = caretOffset === null ? (before + gap + block).length : before.length + gap.length + caretOffset;
        return { text, start: caret, end: caret };
      }),
    [applyTransform],
  );

  const linePrefix = useCallback(
    (kind) =>
      applyTransform((v, s, e) => {
        const start = v.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
        let end = v.indexOf('\n', e);
        if (end === -1) end = v.length;
        const lines = v.slice(start, end).split('\n');
        const make = (i) => (kind === 'ul' ? '- ' : kind === 'ol' ? `${i + 1}. ` : kind === 'todo' ? '- [ ] ' : '> ');
        const nonEmpty = lines.filter((l) => l.trim() !== '');
        const already = nonEmpty.length > 0 && nonEmpty.every((l, i) => l.startsWith(make(i)));
        const next = lines.map((l, i) => {
          const indent = /^\s*/.exec(l)[0];
          const body = l.slice(indent.length).replace(/^(-\s\[[ xX]\]\s|>\s?|[-*+]\s|\d+[.)]\s)/, '');
          if (l.trim() === '') return l;
          if (already) return indent + body;
          return indent + make(i) + body;
        });
        const text = v.slice(0, start) + next.join('\n') + v.slice(end);
        return { text, start, end: start + next.join('\n').length };
      }),
    [applyTransform],
  );

  // ── 鍵盤事件 ──────────────────────────────────────────────────────────
  const onEditorKeyDown = (e) => {
    const el = editorRef.current;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      flushSave();
      return;
    }
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrap('**', '**', '粗體');
      return;
    }
    if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrap('*', '*', '斜體');
      return;
    }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setDialog({ type: 'link' });
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      wrap('`', '`', 'code');
      return;
    }

    if (e.key === 'Tab') {
      const { selectionStart: s, selectionEnd: en, value } = el;
      e.preventDefault();
      const start = value.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
      let end = value.indexOf('\n', en);
      if (end === -1) end = value.length;
      const lines = value.slice(start, end).split('\n');
      const next = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : `  ${l}`));
      const text = value.slice(0, start) + next.join('\n') + value.slice(end);
      setContent(text);
      updateDraft({ content: text });
      requestAnimationFrame(() => {
        el.focus();
        const delta = next.join('\n').length - lines.join('\n').length;
        el.setSelectionRange(s + (e.shiftKey ? Math.max(-2, delta) : delta), en + delta);
      });
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      const { selectionStart: s, selectionEnd: en, value } = el;
      if (s !== en) return;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const line = value.slice(lineStart, s);
      const m = /^(\s*)(-\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s)(.*)$/.exec(line);
      if (!m) return;
      const [, indent, marker, rest] = m;
      e.preventDefault();
      if (!rest.trim()) {
        const text = value.slice(0, lineStart) + value.slice(s);
        setContent(text);
        updateDraft({ content: text });
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(lineStart, lineStart);
        });
        return;
      }
      const nextMarker = /^\d+[.)]\s/.test(marker) ? `${parseInt(marker, 10) + 1}. ` : marker;
      const insert = `\n${indent}${nextMarker}`;
      const text = value.slice(0, s) + insert + value.slice(s);
      setContent(text);
      updateDraft({ content: text });
      const caret = s + insert.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    }
  };

  // 全域快捷鍵：Ctrl/Cmd+S 立即儲存、Ctrl/Cmd+E 切換模式
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushSave();
      }
      if (e.key.toLowerCase() === 'e' && !e.shiftKey && noteId) {
        e.preventDefault();
        setMode(mode === 'read' ? 'edit' : 'read');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [flushSave, mode, setMode, noteId]);

  // 標題欄自動增高
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, noteId]);

  // ── 工具列 ────────────────────────────────────────────────────────────
  const headingPrefix = useCallback(
    (level) =>
      applyTransform((v, s) => {
        const start = v.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
        let end = v.indexOf('\n', s);
        if (end === -1) end = v.length;
        const line = v.slice(start, end);
        const stripped = line.replace(/^#{1,6}\s*/, '');
        const next = `${'#'.repeat(level)} ${stripped}`;
        const text = v.slice(0, start) + next + v.slice(end);
        return { text, start: start + next.length, end: start + next.length };
      }),
    [applyTransform],
  );

  // 上傳單一檔案並插入（每次僅處理一個檔案）
  const pickUpload = () => uploadRef.current?.click();

  const handleUploaded = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      store.notify?.(`正在上傳「${file.name}」…`, 'info');
      const record = await uploadFile(file, { folderId: null });
      insertBlock(snippetForFile(record));
      store.notify?.('已插入檔案', 'success');
    } catch (err) {
      store.notify?.(err?.message || '上傳失敗', 'error');
    } finally {
      setUploading(false);
    }
  };

  const tools = useMemo(
    () => [
      { key: 'bold', icon: 'bold', title: '粗體（Ctrl+B）', run: () => wrap('**', '**', '粗體') },
      { key: 'italic', icon: 'italic', title: '斜體（Ctrl+I）', run: () => wrap('*', '*', '斜體') },
      { key: 'strike', icon: 'strikethrough', title: '刪除線', run: () => wrap('~~', '~~', '刪除') },
      { key: 'code', icon: 'code', title: '行內程式碼（Ctrl+Shift+E）', run: () => wrap('`', '`', 'code') },
      { sep: true },
      { key: 'h1', icon: 'heading1', title: '標題 1', run: () => headingPrefix(1) },
      { key: 'h2', icon: 'heading2', title: '標題 2', run: () => headingPrefix(2) },
      { key: 'h3', icon: 'heading3', title: '標題 3', run: () => headingPrefix(3) },
      { key: 'quote', icon: 'quote', title: '引用', run: () => linePrefix('quote') },
      { sep: true },
      { key: 'ul', icon: 'list', title: '項目清單', run: () => linePrefix('ul') },
      { key: 'ol', icon: 'listOrdered', title: '編號清單', run: () => linePrefix('ol') },
      { key: 'todo', icon: 'todo', title: '待辦清單', run: () => linePrefix('todo') },
      { sep: true },
      { key: 'link', icon: 'link', title: '插入連結（Ctrl+K）', run: () => setDialog({ type: 'link' }) },
      { key: 'image', icon: 'image', title: '插入外鏈圖片', run: () => setDialog({ type: 'image' }) },
      { key: 'audio', icon: 'audio', title: '插入音訊', run: () => setDialog({ type: 'audio' }) },
      { key: 'video', icon: 'video', title: '插入影片', run: () => setDialog({ type: 'video' }) },
      { key: 'embed', icon: 'play', title: '插入 YouTube／Vimeo／Bilibili', run: () => setDialog({ type: 'embed' }) },
      {
        key: 'upload',
        icon: 'upload',
        title: uploading ? '上傳中…' : '上傳檔案並插入（單檔，圖片／音訊／影片）',
        run: pickUpload,
        busy: uploading,
      },
      { sep: true },
      {
        key: 'codeblock',
        icon: 'codeBlock',
        title: '程式碼區塊',
        run: () => insertBlock('```js\n\n```', 6),
      },
      {
        key: 'table',
        icon: 'table',
        title: '表格',
        run: () => insertBlock('| 欄位 | 欄位 | 欄位 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'),
      },
      { key: 'hr', icon: 'hr', title: '分隔線', run: () => insertBlock('---') },
    ],
    [wrap, linePrefix, insertBlock, headingPrefix],
  );

  // ── 插入對話框 ────────────────────────────────────────────────────────
  const dialogConfig = useMemo(() => {
    const configs = {
      link: {
        title: '插入連結',
        fields: [
          { name: 'text', label: '顯示文字', placeholder: '連結文字（可留空）' },
          { name: 'url', label: '網址', placeholder: 'https://example.com', required: true },
        ],
        build: (v) => `[${v.text || v.url}](${v.url})`,
        inline: true,
      },
      image: {
        title: '插入外鏈圖片',
        subtitle: '圖片會直接以網址載入，點擊可放大檢視',
        fields: [
          { name: 'url', label: '圖片網址', placeholder: 'https://example.com/photo.jpg', required: true },
          { name: 'alt', label: '替代文字／說明', placeholder: '圖片說明（可留空）' },
        ],
        build: (v) => (v.alt ? `![${v.alt}](${v.url})` : `![](${v.url})`),
      },
      audio: {
        title: '插入音訊',
        subtitle: '支援 mp3、wav、ogg、m4a、flac 等外鏈音訊',
        fields: [
          { name: 'url', label: '音訊網址', placeholder: 'https://example.com/song.mp3', required: true },
          { name: 'label', label: '標題', placeholder: '（可留空）' },
        ],
        build: (v) => `${v.label ? `**${v.label}**\n\n` : ''}<audio controls src="${v.url}"></audio>`,
      },
      video: {
        title: '插入影片',
        subtitle: '支援 mp4、webm 等外鏈影片；YouTube／Vimeo 請用「影音平台」',
        fields: [
          { name: 'url', label: '影片網址', placeholder: 'https://example.com/clip.mp4', required: true },
          { name: 'poster', label: '封面圖網址', placeholder: '（可留空）' },
          { name: 'label', label: '標題', placeholder: '（可留空）' },
        ],
        build: (v) =>
          `${v.label ? `**${v.label}**\n\n` : ''}<video controls${v.poster ? ` poster="${v.poster}"` : ''} src="${v.url}"></video>`,
      },
      embed: {
        title: '插入影音平台連結',
        subtitle: '閱讀模式會自動轉為内嵌播放器（YouTube、Vimeo、Bilibili）',
        fields: [{ name: 'url', label: '影片網址', placeholder: 'https://www.youtube.com/watch?v=…', required: true }],
        build: (v) => v.url,
      },
    };
    return dialog ? configs[dialog.type] : null;
  }, [dialog]);

  const submitDialog = (values) => {
    const cfg = dialogConfig;
    setDialog(null);
    if (!cfg) return;
    const snippet = cfg.build(
      Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '').trim()])),
    );
    if (cfg.inline) {
      const el = editorRef.current;
      const pos = el ? el.selectionStart : content.length;
      const text = content.slice(0, pos) + snippet + content.slice(pos);
      setContent(text);
      updateDraft({ content: text });
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(pos + snippet.length, pos + snippet.length);
      });
    } else {
      insertBlock(snippet);
    }
  };

  // ── 未選擇筆記 ────────────────────────────────────────────────────────
  if (!noteId) {
    return (
      <section className="editor editor-empty" aria-label="筆記內容">
        <div className="editor-empty-inner">
          <Icon name="note" size={34} />
          <h2>選擇或建立一篇筆記</h2>
          <p>從左側清單挑選筆記，或按「新增筆記」開始撰寫。</p>
          <div className="editor-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => store.createNote()}>
              <Icon name="plus" size={15} />
              新增筆記
            </button>
            {!isMobile && (
              <button type="button" className="btn" onClick={onToggleSidebar}>
                <Icon name="sidebar" size={15} />
                顯示側邊欄
              </button>
            )}
          </div>
          <ul className="editor-empty-tips">
            <li>
              <Icon name="image" size={13} /> 外鏈圖片可直接顯示，點擊放大
            </li>
            <li>
              <Icon name="audio" size={13} /> mp3／wav 等音訊連結會變成播放器
            </li>
            <li>
              <Icon name="video" size={13} /> mp4／webm 與 YouTube、Vimeo、Bilibili 可直接播放
            </li>
            <li>
              <Icon name="clock" size={13} /> 自動儲存，Ctrl/Cmd + S 可立即儲存
            </li>
          </ul>
        </div>
      </section>
    );
  }

  const stats = countWords(content);
  const category = categories.find((c) => c.id === note.category_id);
  const saveLabel =
    saveState.state === 'saving'
      ? '儲存中…'
      : saveState.state === 'error'
        ? '儲存失敗'
        : dirty
          ? '尚未儲存'
          : saveState.at
            ? `已儲存 ${formatDateTime(saveState.at)}`
            : '已同步';

  const onRequestMove = (n) => setDialog({ type: 'move', noteId: n.id });

  const moreItems = [
    { key: 'pin', label: note.pinned ? '取消釘選' : '釘選筆記', icon: 'pin', onClick: () => store.togglePin(note) },
    { key: 'dup', label: '建立副本', icon: 'copy', onClick: () => store.duplicateNote(note.id) },
    {
      key: 'copy',
      label: '複製 Markdown',
      icon: 'code',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(`# ${title || '未命名筆記'}\n\n${content}`);
          store.notify('已複製 Markdown', 'success');
        } catch {
          store.notify('瀏覽器不允許複製', 'error');
        }
      },
    },
    { key: 'move', label: '移動到分類…', icon: 'folder', onClick: () => onRequestMove(note) },
    { separator: true },
    {
      key: 'archive',
      label: note.archived ? '還原筆記' : '封存筆記',
      icon: 'archive',
      onClick: () => store.toggleArchive(note),
    },
    { key: 'delete', label: '刪除筆記', icon: 'trash', tone: 'danger', onClick: () => onRequestDelete(note) },
  ];

  const showWrite = mode !== 'read' && !(isMobile && mode === 'split');
  const showPreview = mode === 'read' || mode === 'split';

  return (
    <section className={`editor mode-${mode} ${contentReady ? '' : 'is-loading'}`} aria-label="筆記內容">
      <header className="editor-topbar">
        {isMobile && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="返回筆記列表">
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        {!isMobile && (
          <button type="button" className="icon-btn" onClick={onToggleSidebar} title="切換側邊欄" aria-label="切換側邊欄">
            <Icon name="sidebar" size={17} />
          </button>
        )}

        <div className="editor-crumb">
          <span className="crumb-cat">
            <Icon name="folder" size={13} />
            {category ? `${category.emoji ? `${category.emoji} ` : ''}${category.name}` : '未分類'}
          </span>
          <Icon name="chevronRight" size={12} className="crumb-sep" />
          <span className="crumb-title">{title || '未命名筆記'}</span>
        </div>

        <div className="editor-actions">
          <button
            type="button"
            className={`icon-btn ${note.pinned ? 'is-on' : ''}`}
            onClick={() => store.togglePin(note)}
            title={note.pinned ? '取消釘選' : '釘選'}
            aria-label="釘選"
          >
            <Icon name="pin" size={16} />
          </button>

          <div className="mode-switch" role="group" aria-label="顯示模式">
            <button type="button" className={mode === 'edit' ? 'is-on' : ''} onClick={() => setMode('edit')} title="編輯">
              <Icon name="edit" size={14} />
              {!isMobile && <span>編輯</span>}
            </button>
            {!isMobile && (
              <button type="button" className={mode === 'split' ? 'is-on' : ''} onClick={() => setMode('split')} title="並排預覽">
                <Icon name="columns" size={14} />
                <span>並排</span>
              </button>
            )}
            <button type="button" className={mode === 'read' ? 'is-on' : ''} onClick={() => setMode('read')} title="閱讀（Ctrl+E）">
              <Icon name="eye" size={14} />
              {!isMobile && <span>閱讀</span>}
            </button>
          </div>

          <Menu icon="more" title="更多選項" items={moreItems} />
        </div>
      </header>

      <div className="editor-meta">
        <select
          className="meta-select"
          value={note.category_id || ''}
          onChange={(e) => store.moveNoteToCategory(note.id, e.target.value)}
          aria-label="所屬分類"
        >
          <option value="">未分類</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ''}
              {c.name}
            </option>
          ))}
        </select>

        <TagPicker
          allTags={store.tags}
          selected={(note.tags || []).map((t) => t.name)}
          onChange={(names) => store.setNoteTags(note.id, names)}
        />

        <span className="meta-time" title={`建立：${formatDateTime(note.created_at)}`}>
          <Icon name="clock" size={12} />
          {formatDateTime(note.updated_at)}
        </span>
        {note.archived && (
          <span className="meta-badge meta-badge-warn">
            <Icon name="archive" size={11} />
            已封存
          </span>
        )}
      </div>

      <div className={`editor-body ${showWrite && showPreview ? 'is-split' : ''}`}>
        {showWrite && (
          <div className="editor-write">
            <div className="toolbar" role="toolbar" aria-label="Markdown 工具列">
              {tools.map((t, i) =>
                t.sep ? (
                  <span className="toolbar-sep" key={`sep-${i}`} />
                ) : (
                  <button
                    type="button"
                    key={t.key}
                    className={`toolbar-btn ${t.busy ? 'is-busy' : ''}`}
                    title={t.title}
                    aria-label={t.title}
                    disabled={t.busy}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={t.run}
                  >
                    <Icon name={t.busy ? 'refresh' : t.icon} size={15} />
                  </button>
                ),
              )}
            </div>

            <input ref={uploadRef} type="file" hidden onChange={handleUploaded} aria-hidden="true" />

            <div className="editor-scroll">
              <div className="editor-page">
                <textarea
                  ref={titleRef}
                  className="title-input"
                  value={title}
                  rows={1}
                  placeholder="未命名筆記"
                  aria-label="筆記標題"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    updateDraft({ title: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      editorRef.current?.focus();
                    }
                  }}
                />
                <textarea
                  ref={editorRef}
                  className="content-input"
                  value={content}
                  placeholder={'以 Markdown 撰寫…\n\n支援外鏈圖片、音訊、影片與 YouTube／Vimeo／Bilibili 内嵌。'}
                  aria-label="筆記內容"
                  spellCheck="false"
                  onChange={(e) => {
                    setContent(e.target.value);
                    updateDraft({ content: e.target.value });
                  }}
                  onKeyDown={onEditorKeyDown}
                />
              </div>
            </div>
          </div>
        )}

        {showPreview && (
          <div className="editor-preview">
            <div className="editor-scroll">
              <div className="editor-page">
                {contentReady ? (
                  <>
                    {title && <h1 className="preview-title">{title}</h1>}
                    <MarkdownView content={content} embedHosts={embedHosts} />
                  </>
                ) : (
                  <div className="editor-loading">
                    <span className="spinner" />
                    載入筆記中…
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="editor-status">
        <span className={`save-state ${saveState.state} ${dirty ? 'dirty' : ''}`}>
          <span className="dot-indicator" />
          {saveLabel}
        </span>
        <span className="status-sep" />
        <span>{stats.words} 字</span>
        <span className="status-sep" />
        <span>約 {readingTime(content)} 分鐘</span>
        {!isMobile && <span className="status-hint">Ctrl/Cmd + S 儲存・Ctrl/Cmd + E 切換編輯／閱讀</span>}
      </footer>

      {dialog?.type === 'move' && (
        <PromptDialog
          open
          title="移動到分類"
          fields={[
            {
              name: 'categoryId',
              label: '分類',
              type: 'select',
              value: note.category_id || '',
              options: [{ value: '', label: '未分類' }, ...categories.map((c) => ({ value: c.id, label: `${c.emoji ? `${c.emoji} ` : ''}${c.name}` }))],
            },
          ]}
          confirmLabel="移動"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            setDialog(null);
            store.moveNoteToCategory(dialog.noteId, v.categoryId);
          }}
        />
      )}

      {dialog && dialog.type !== 'move' && dialogConfig && (
        <PromptDialog
          open
          title={dialogConfig.title}
          subtitle={dialogConfig.subtitle}
          fields={dialogConfig.fields}
          confirmLabel="插入"
          onCancel={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      )}
    </section>
  );
}
