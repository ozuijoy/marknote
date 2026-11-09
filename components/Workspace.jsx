'use client';

import { useCallback, useEffect, useState } from 'react';
import NoteEditor from './NoteEditor';
import NoteList from './NoteList';
import Sidebar, { SidebarCollapsedBar } from './Sidebar';
import { Icon, Logo } from './Icons';
import { ConfirmDialog, PromptDialog, Toast } from './Modal';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useMediaQuery } from '@/hooks';

const PRESET_COLORS = [
  { value: '', label: '預設' },
  { value: '#e03131', label: '紅' },
  { value: '#d9752b', label: '橘' },
  { value: '#c19315', label: '黃' },
  { value: '#44835c', label: '綠' },
  { value: '#337ea9', label: '藍' },
  { value: '#6940a5', label: '紫' },
  { value: '#a05a8f', label: '粉紫' },
  { value: '#8d6047', label: '棕' },
  { value: '#5b6470', label: '灰' },
];

const EMOJI_SUGGESTIONS = ['📁', '📒', '💡', '🚀', '🧠', '📚', '🎧', '🎬', '🛠️', '🏷️', '📌', '🔖'];

/** 工作區外殼：三欄版面（桌面）／列表 ↔ 筆記（行動端）＋ 抽屜側邊欄 */
export default function Workspace() {
  const store = useWorkspaceStore();
  const { theme, resolved, cycle } = useTheme();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [mobilePane, setMobilePane] = useState('list');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState(null);

  // 桌面：自動選取第一篇筆記
  useEffect(() => {
    if (isMobile) return;
    if (store.selectedId) return;
    if (store.notes.length) store.selectNote(store.notes[0].id);
  }, [isMobile, store.selectedId, store.notes, store]);

  // 切換篩選後，若目前選取的筆記不在清單內則改選第一篇
  useEffect(() => {
    if (!store.notes.length) return;
    if (store.selectedId && store.notes.some((n) => n.id === store.selectedId)) return;
    if (!isMobile) store.selectNote(store.notes[0].id);
  }, [store.notes, store.selectedId, isMobile, store]);

  const openNote = useCallback(
    (id) => {
      store.selectNote(id);
      if (isMobile) setMobilePane('note');
    },
    [store, isMobile],
  );

  const newNote = useCallback(
    async (categoryId = null) => {
      const note = await store.createNote({ categoryId });
      if (note && isMobile) setMobilePane('note');
    },
    [store, isMobile],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      window.location.href = '/login';
    }
  }, []);

  // ── 載入中 / 錯誤 ────────────────────────────────────────────────────
  if (store.status === 'error') {
    return (
      <div className="screen-message">
        <Icon name="warning" size={30} />
        <h1>無法載入資料</h1>
        <p>{store.loadError}</p>
        <div className="screen-actions">
          <button type="button" className="btn btn-primary" onClick={store.load}>
            <Icon name="refresh" size={15} />
            重試
          </button>
          <button type="button" className="btn" onClick={logout}>
            <Icon name="logout" size={15} />
            登出
          </button>
        </div>
      </div>
    );
  }

  const sidebarProps = {
    store,
    theme,
    resolvedTheme: resolved,
    onCycleTheme: cycle,
    onLogout: logout,
    onNewNote: newNote,
    onNewCategory: () => setDialog({ type: 'category-new' }),
    onEditCategory: (category) => setDialog({ type: 'category-edit', category }),
    onDeleteCategory: (category) => setDialog({ type: 'category-delete', category }),
    onNewTag: () => setDialog({ type: 'tag-new' }),
    onEditTag: (tag) => setDialog({ type: 'tag-edit', tag }),
    onDeleteTag: (tag) => setDialog({ type: 'tag-delete', tag }),
  };

  return (
    <div
      className={`app ${isMobile ? 'is-mobile' : 'is-desktop'} ${
        store.sidebarOpen ? 'sidebar-open' : 'sidebar-closed'
      } mobile-pane-${isMobile ? mobilePane : 'none'}`}
    >
      {!isMobile &&
        (store.sidebarOpen ? (
          <Sidebar {...sidebarProps} variant="desktop" />
        ) : (
          <SidebarCollapsedBar onOpen={() => store.setSidebarOpen(true)} appName={store.appName} />
        ))}

      {isMobile && drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <Sidebar {...sidebarProps} variant="mobile" onClose={() => setDrawerOpen(false)} />
        </>
      )}

      <div className="app-main">
        {isMobile && (
          <header className="mobile-topbar">
            {mobilePane === 'list' ? (
              <>
                <button type="button" className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="開啟側邊欄">
                  <Icon name="menu" size={19} />
                </button>
                <span className="mobile-brand">
                  <Logo size={18} />
                  <strong>{store.appName}</strong>
                </span>
                <button type="button" className="icon-btn" onClick={cycle} aria-label="切換主題">
                  <Icon name={resolved === 'dark' ? 'moon' : theme === 'system' ? 'monitor' : 'sun'} size={17} />
                </button>
              </>
            ) : (
              <span className="mobile-topbar-spacer" />
            )}
          </header>
        )}

        <NoteList
          store={store}
          variant={isMobile ? 'mobile' : 'desktop'}
          onOpenNote={openNote}
          onNewNote={() => newNote()}
          onRequestMoveCategory={(n) => setDialog({ type: 'note-move', note: n })}
          onRequestDelete={(n) => setDialog({ type: 'note-delete', note: n })}
        />

        <NoteEditor
          store={store}
          variant={isMobile ? 'mobile' : 'desktop'}
          onBack={() => setMobilePane('list')}
          onRequestDelete={(n) => setDialog({ type: 'note-delete', note: n })}
          onToggleSidebar={() => store.setSidebarOpen(!store.sidebarOpen)}
        />
      </div>

      <Toast toast={store.toast} onDismiss={store.dismissToast} />

      {/* ── 對話框 ───────────────────────────────────────────────────── */}
      {(dialog?.type === 'category-new' || dialog?.type === 'category-edit') && (
        <PromptDialog
          open
          title={dialog.type === 'category-new' ? '新增分類' : '編輯分類'}
          fields={[
            {
              name: 'name',
              label: '分類名稱',
              required: true,
              autoFocus: true,
              value: dialog.category?.name || '',
              placeholder: '例如：工作、讀書筆記',
            },
            {
              name: 'emoji',
              label: '圖示（一個 emoji，可留空）',
              value: dialog.category?.emoji || '',
              placeholder: EMOJI_SUGGESTIONS[0],
              hint: `常用：${EMOJI_SUGGESTIONS.join(' ')}`,
            },
            {
              name: 'color',
              label: '顏色',
              type: 'select',
              value: dialog.category?.color || '',
              options: PRESET_COLORS.map((c) => ({ value: c.value, label: c.label })),
            },
          ]}
          confirmLabel={dialog.type === 'category-new' ? '建立' : '儲存'}
          onCancel={() => setDialog(null)}
          onSubmit={async (values) => {
            const payload = { name: values.name, emoji: values.emoji, color: values.color };
            setDialog(null);
            if (dialog.type === 'category-new') await store.addCategory(payload);
            else await store.renameCategory(dialog.category.id, payload);
          }}
        />
      )}

      {dialog?.type === 'category-delete' && (
        <ConfirmDialog
          open
          title={`刪除分類「${dialog.category.name}」？`}
          description="分類會被移除，其下的筆記會變成「未分類」（筆記本身不會被刪除）。"
          confirmLabel="刪除分類"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const id = dialog.category.id;
            setDialog(null);
            await store.removeCategory(id);
          }}
        />
      )}

      {(dialog?.type === 'tag-new' || dialog?.type === 'tag-edit') && (
        <PromptDialog
          open
          title={dialog.type === 'tag-new' ? '新增標籤' : '編輯標籤'}
          fields={[
            {
              name: 'name',
              label: '標籤名稱',
              required: true,
              autoFocus: true,
              value: dialog.tag?.name || '',
              placeholder: '例如：待辦、靈感',
            },
            {
              name: 'color',
              label: '顏色',
              type: 'select',
              value: dialog.tag?.color || '',
              options: PRESET_COLORS.map((c) => ({ value: c.value, label: c.label })),
            },
          ]}
          confirmLabel={dialog.type === 'tag-new' ? '建立' : '儲存'}
          onCancel={() => setDialog(null)}
          onSubmit={async (values) => {
            setDialog(null);
            if (dialog.type === 'tag-new') await store.addTag({ name: values.name, color: values.color });
            else await store.renameTag(dialog.tag.id, { name: values.name, color: values.color });
          }}
        />
      )}

      {dialog?.type === 'tag-delete' && (
        <ConfirmDialog
          open
          title={`刪除標籤「#${dialog.tag.name}」？`}
          description="所有筆記上的這個標籤都會被移除，筆記本身不受影響。"
          confirmLabel="刪除標籤"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const id = dialog.tag.id;
            setDialog(null);
            await store.removeTag(id);
          }}
        />
      )}

      {dialog?.type === 'note-delete' && (
        <ConfirmDialog
          open
          title={`刪除「${dialog.note.title?.trim() || '未命名筆記'}」？`}
          description="此操作無法復原，筆記內容與標籤關聯都會一併移除。"
          confirmLabel="永久刪除"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const id = dialog.note.id;
            setDialog(null);
            await store.removeNote(id);
            if (isMobile) setMobilePane('list');
          }}
        />
      )}

      {dialog?.type === 'note-move' && (
        <PromptDialog
          open
          title="移動到分類"
          fields={[
            {
              name: 'categoryId',
              label: '分類',
              type: 'select',
              value: dialog.note.category_id || '',
              options: [
                { value: '', label: '未分類' },
                ...store.categories.map((c) => ({
                  value: c.id,
                  label: `${c.emoji ? `${c.emoji} ` : ''}${c.name}`,
                })),
              ],
            },
          ]}
          confirmLabel="移動"
          onCancel={() => setDialog(null)}
          onSubmit={async (values) => {
            const id = dialog.note.id;
            setDialog(null);
            await store.moveNoteToCategory(id, values.categoryId);
          }}
        />
      )}
    </div>
  );
}
