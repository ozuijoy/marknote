'use client';

import { useState } from 'react';
import { Icon, Logo } from './Icons';
import { Menu } from './Modal';
import { colorFor } from '@/lib/format';
import { useLocalState } from '@/hooks';

/**
 * 左側欄：快速檢視、分類、標籤。
 * 桌面可整列折疊；行動端以抽屜方式呈現。
 */
export default function Sidebar({
  store,
  theme,
  resolvedTheme,
  onCycleTheme,
  onLogout,
  onNewNote,
  onEditCategory,
  onDeleteCategory,
  onNewCategory,
  onEditTag,
  onDeleteTag,
  onNewTag,
  variant = 'desktop',
  onClose,
}) {
  const {
    appName,
    categories,
    tags,
    filter,
    setFilter,
    allNotesCount,
    pinnedCount,
    archivedCount,
  } = store;

  const [openCategories, setOpenCategories] = useLocalState('mn.section.categories', true);
  const [openTags, setOpenTags] = useLocalState('mn.section.tags', true);

  const select = (next) => {
    setFilter(next);
    store.setQuery('');
    if (variant === 'mobile') onClose?.();
  };

  const isActive = (type, id) => filter.type === type && (id === undefined || filter.id === id);

  const quickItems = [
    { type: 'all', label: '全部筆記', icon: 'notes', count: allNotesCount },
    { type: 'pinned', label: '已釘選', icon: 'pin', count: pinnedCount },
    { type: 'archived', label: '已封存', icon: 'archive', count: archivedCount },
  ];

  return (
    <aside className={`sidebar sidebar-${variant}`} aria-label="分類與標籤">
      <div className="sidebar-head">
        <span className="brand">
          <Logo size={22} />
          <strong>{appName}</strong>
        </span>
        <span className="sidebar-head-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onCycleTheme}
            title={`主題：${theme === 'system' ? '跟隨系統' : theme === 'dark' ? '深色' : '淺色'}（點擊切換）`}
            aria-label="切換主題"
          >
            <Icon name={resolvedTheme === 'dark' ? 'moon' : theme === 'system' ? 'monitor' : 'sun'} size={16} />
          </button>
          {variant === 'mobile' && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉側邊欄">
              <Icon name="close" size={16} />
            </button>
          )}
        </span>
      </div>

      <button type="button" className="new-note-btn" onClick={onNewNote}>
        <Icon name="plus" size={16} />
        <span>新增筆記</span>
      </button>

      <nav className="sidebar-scroll">
        <ul className="nav-list">
          {quickItems.map((item) => (
            <li key={item.type}>
              <button
                type="button"
                className={`nav-item ${isActive(item.type) ? 'is-active' : ''}`}
                onClick={() => select({ type: item.type, id: null })}
              >
                <Icon name={item.icon} size={16} />
                <span className="nav-label">{item.label}</span>
                <span className="nav-count">{item.count}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* 分類 */}
        <section className="side-section">
          <header className="side-section-head">
            <button
              type="button"
              className="side-section-toggle"
              onClick={() => setOpenCategories((v) => !v)}
              aria-expanded={openCategories}
            >
              <Icon name={openCategories ? 'chevronDown' : 'chevronRight'} size={13} />
              <span>分類</span>
              <span className="side-section-count">{categories.length}</span>
            </button>
            <button type="button" className="icon-btn icon-btn-xs" onClick={onNewCategory} title="新增分類" aria-label="新增分類">
              <Icon name="plus" size={14} />
            </button>
          </header>
          {openCategories && (
            <ul className="nav-list">
              <li>
                <button
                  type="button"
                  className={`nav-item ${filter.type === 'category' && !filter.id ? 'is-active' : ''}`}
                  onClick={() => select({ type: 'category', id: null })}
                >
                  <Icon name="folder" size={15} />
                  <span className="nav-label">未分類</span>
                  <span className="nav-count">
                    {allNotesCount - categories.reduce((sum, c) => sum + (Number(c.note_count) || 0), 0)}
                  </span>
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <div className={`nav-row ${isActive('category', c.id) ? 'is-active' : ''}`}>
                    <button
                      type="button"
                      className="nav-item"
                      onClick={() => select({ type: 'category', id: c.id })}
                    >
                      <span className="nav-emoji">{c.emoji || <Icon name="folder" size={15} />}</span>
                      <span className="nav-label" style={c.color ? { color: c.color } : undefined}>
                        {c.name}
                      </span>
                      <span className="nav-count">{Number(c.note_count) || 0}</span>
                    </button>
                    <Menu
                      icon="more"
                      buttonClassName="icon-btn icon-btn-xs nav-menu"
                      title={`${c.name} 的選項`}
                      items={[
                        { key: 'new', label: '在此分類新增筆記', icon: 'plus', onClick: () => onNewNote(c.id) },
                        { key: 'rename', label: '重新命名／圖示', icon: 'edit', onClick: () => onEditCategory(c) },
                        { separator: true },
                        { key: 'up', label: '上移', icon: 'chevronDown', onClick: () => store.moveCategory(c.id, 'up') },
                        { key: 'down', label: '下移', icon: 'chevronDown', onClick: () => store.moveCategory(c.id, 'down') },
                        { separator: true },
                        { key: 'delete', label: '刪除分類', icon: 'trash', tone: 'danger', onClick: () => onDeleteCategory(c) },
                      ]}
                    />
                  </div>
                </li>
              ))}
              {categories.length === 0 && <li className="side-empty">尚無分類</li>}
            </ul>
          )}
        </section>

        {/* 標籤 */}
        <section className="side-section">
          <header className="side-section-head">
            <button
              type="button"
              className="side-section-toggle"
              onClick={() => setOpenTags((v) => !v)}
              aria-expanded={openTags}
            >
              <Icon name={openTags ? 'chevronDown' : 'chevronRight'} size={13} />
              <span>標籤</span>
              <span className="side-section-count">{tags.length}</span>
            </button>
            <button type="button" className="icon-btn icon-btn-xs" onClick={onNewTag} title="新增標籤" aria-label="新增標籤">
              <Icon name="plus" size={14} />
            </button>
          </header>
          {openTags && (
            <div className="tag-cloud">
              {tags.map((t) => {
                const palette = colorFor(t.color || t.name);
                const active = isActive('tag', t.id);
                return (
                  <span
                    key={t.id}
                    className={`tag-chip ${active ? 'is-active' : ''}`}
                    style={{ background: t.color || palette.bg, color: t.color ? '#fff' : palette.fg }}
                  >
                    <button type="button" onClick={() => select({ type: 'tag', id: t.id })} title={`篩選 #${t.name}`}>
                      #{t.name}
                      <em>{Number(t.note_count) || 0}</em>
                    </button>
                    <Menu
                      icon="more"
                      buttonClassName="tag-chip-menu"
                      title={`${t.name} 的選項`}
                      items={[
                        { key: 'rename', label: '重新命名／顏色', icon: 'edit', onClick: () => onEditTag(t) },
                        { key: 'delete', label: '刪除標籤', icon: 'trash', tone: 'danger', onClick: () => onDeleteTag(t) },
                      ]}
                    />
                  </span>
                );
              })}
              {tags.length === 0 && <span className="side-empty">尚無標籤</span>}
            </div>
          )}
        </section>
      </nav>

      <div className="sidebar-foot">
        <button type="button" className="side-foot-btn" onClick={store.refresh} title="重新整理資料">
          <Icon name="refresh" size={14} />
          <span>重新整理</span>
        </button>
        <button type="button" className="side-foot-btn" onClick={onLogout} title="登出">
          <Icon name="logout" size={14} />
          <span>登出</span>
        </button>
      </div>
    </aside>
  );
}

/** 桌面折疊後的小型展開鈕 */
export function SidebarCollapsedBar({ onOpen, appName }) {
  const [hint, setHint] = useState(false);
  return (
    <div className="sidebar-collapsed" onMouseEnter={() => setHint(true)} onMouseLeave={() => setHint(false)}>
      <button type="button" className="icon-btn" onClick={onOpen} title="展開側邊欄" aria-label="展開側邊欄">
        <Icon name="sidebar" size={17} />
      </button>
      {hint && <span className="sidebar-collapsed-hint">{appName}</span>}
    </div>
  );
}
