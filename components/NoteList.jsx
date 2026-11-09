'use client';

import { Icon } from './Icons';
import { Menu } from './Modal';
import { colorFor, relativeTime } from '@/lib/format';

/**
 * 中欄：筆記列表。
 * 行動端登入後預認顯示這一欄。
 */
export default function NoteList({
  store,
  onOpenNote,
  onNewNote,
  onRequestMoveCategory,
  onRequestDelete,
  variant = 'desktop',
}) {
  const {
    notes,
    filter,
    filterMeta,
    query,
    setQuery,
    searching,
    sort,
    setSort,
    selectedId,
    categories,
    tags,
    status,
  } = store;

  const categoryName = (id) => {
    if (!id) return null;
    const c = categories.find((x) => x.id === id);
    return c ? `${c.emoji ? `${c.emoji} ` : ''}${c.name}` : null;
  };

  return (
    <section className={`note-list note-list-${variant}`} aria-label="筆記列表">
      <header className="list-head">
        <div className="list-head-title">
          <h1>{filterMeta.title}</h1>
          <span className="list-count">
            {searching ? '搜尋中…' : `${notes.length} 篇`}
          </span>
        </div>
        <div className="list-head-actions">
          <Menu
            icon="sort"
            title="排序方式"
            items={[
              { key: 'updated', label: '最近更新', active: sort === 'updated', onClick: () => setSort('updated') },
              { key: 'created', label: '建立時間', active: sort === 'created', onClick: () => setSort('created') },
              { key: 'title', label: '標題（注音順序）', active: sort === 'title', onClick: () => setSort('title') },
            ]}
          />
          <button type="button" className="icon-btn" onClick={onNewNote} title="新增筆記" aria-label="新增筆記">
            <Icon name="plus" size={17} />
          </button>
        </div>
      </header>

      <div className="list-search">
        <Icon name="search" size={15} className="list-search-icon" />
        <input
          type="search"
          value={query}
          placeholder="搜尋標題、內文與標籤…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜尋筆記"
        />
        {query && (
          <button type="button" className="icon-btn icon-btn-xs" onClick={() => setQuery('')} aria-label="清除搜尋">
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      <div className="list-scroll">
        {status === 'loading' && (
          <ul className="note-cards">
            {[0, 1, 2, 3].map((i) => (
              <li className="note-card skeleton" key={i}>
                <span className="skeleton-line w70" />
                <span className="skeleton-line w100" />
                <span className="skeleton-line w40" />
              </li>
            ))}
          </ul>
        )}

        {status !== 'loading' && notes.length === 0 && (
          <div className="list-empty">
            <Icon name={query ? 'search' : filter.type === 'archived' ? 'archive' : 'note'} size={26} />
            <p>
              {query
                ? searching
                  ? '搜尋中…'
                  : '找不到符合的筆記'
                : filter.type === 'archived'
                  ? '沒有已封存的筆記'
                  : '這裡還沒有筆記'}
            </p>
            {!query && filter.type !== 'archived' && (
              <button type="button" className="btn btn-primary" onClick={onNewNote}>
                <Icon name="plus" size={15} />
                新增第一篇筆記
              </button>
            )}
          </div>
        )}

        {status !== 'loading' && notes.length > 0 && (
          <ul className="note-cards">
            {notes.map((note) => {
              const active = note.id === selectedId;
              const shownTags = (note.tags || []).slice(0, 3);
              const cat = categoryName(note.category_id);
              return (
                <li key={note.id}>
                  <article
                    className={`note-card ${active ? 'is-active' : ''}`}
                    onClick={() => onOpenNote(note.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenNote(note.id);
                      }
                    }}
                  >
                    <div className="note-card-top">
                      <h2 className="note-card-title">
                        {note.pinned && <Icon name="pin" size={12} className="pin-icon" />}
                        {note.title?.trim() || '未命名筆記'}
                      </h2>
                      <Menu
                        icon="more"
                        buttonClassName="icon-btn icon-btn-xs note-card-menu"
                        title="筆記選項"
                        items={[
                          { key: 'open', label: '開啟', icon: 'note', onClick: () => onOpenNote(note.id) },
                          {
                            key: 'pin',
                            label: note.pinned ? '取消釘選' : '釘選',
                            icon: 'pin',
                            onClick: () => store.togglePin(note),
                          },
                          {
                            key: 'move',
                            label: '移動到分類…',
                            icon: 'folder',
                            onClick: () => onRequestMoveCategory(note),
                          },
                          { key: 'dup', label: '建立副本', icon: 'copy', onClick: () => store.duplicateNote(note.id) },
                          { separator: true },
                          {
                            key: 'archive',
                            label: note.archived ? '還原筆記' : '封存',
                            icon: 'archive',
                            onClick: () => store.toggleArchive(note),
                          },
                          {
                            key: 'delete',
                            label: '刪除',
                            icon: 'trash',
                            tone: 'danger',
                            onClick: () => onRequestDelete(note),
                          },
                        ]}
                      />
                    </div>

                    {(note.excerpt || note.snippet) && (
                      <p className="note-card-excerpt">{note.snippet || note.excerpt}</p>
                    )}

                    <div className="note-card-meta">
                      <time dateTime={note.updated_at} title={new Date(note.updated_at).toLocaleString('zh-TW')}>
                        {relativeTime(note.updated_at)}
                      </time>
                      {cat && (
                        <span className="meta-cat">
                          <Icon name="folder" size={11} />
                          {cat}
                        </span>
                      )}
                      {note.has_media && (
                        <span className="meta-badge" title="內含圖片／音訊／影片">
                          <Icon name="image" size={11} />
                          媒體
                        </span>
                      )}
                      {shownTags.map((t) => {
                        const palette = colorFor(t.color || t.name);
                        return (
                          <span
                            key={t.id}
                            className="meta-tag"
                            style={{ background: t.color || palette.bg, color: t.color ? '#fff' : palette.fg }}
                          >
                            #{t.name}
                          </span>
                        );
                      })}
                      {(note.tags || []).length > shownTags.length && (
                        <span className="meta-tag meta-tag-more">+{note.tags.length - shownTags.length}</span>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="list-foot">
        <span>{tags.length} 個標籤</span>
        <span>{categories.length} 個分類</span>
      </footer>
    </section>
  );
}
