'use client';

import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import { Menu } from './Modal';
import { formatBytes } from '@/lib/format';

/** 資料夾樹：根目錄 + 巢狀資料夾，可展開／收合 */
export default function FolderTree({ folders, stats, currentId, onSelect, onCreate, onRename, onDelete }) {
  const [collapsed, setCollapsed] = useState(() => new Set());

  const childrenOf = useMemo(() => {
    const map = new Map();
    for (const f of folders) {
      const key = f.parent_id || 'root';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return map;
  }, [folders]);

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderLevel = (parentKey, depth) =>
    (childrenOf.get(parentKey) || []).map((folder) => {
      const kids = childrenOf.get(folder.id) || [];
      const isOpen = !collapsed.has(folder.id);
      return (
        <li key={folder.id}>
          <div
            className={`folder-row ${currentId === folder.id ? 'is-active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {kids.length ? (
              <button
                type="button"
                className="folder-caret"
                onClick={() => toggle(folder.id)}
                aria-label={isOpen ? '收合' : '展開'}
                aria-expanded={isOpen}
              >
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
              </button>
            ) : (
              <span className="folder-caret is-empty" />
            )}
            <button type="button" className="folder-name" onClick={() => onSelect(folder.id)} title={folder.name}>
              <Icon name="folder" size={14} />
              <span>{folder.name}</span>
              {folder.file_count > 0 && <em>{folder.file_count}</em>}
            </button>
            <Menu
              icon="more"
              title="資料夾選項"
              buttonClassName="icon-btn icon-btn-xs folder-menu-btn"
              items={[
                { label: '新增子資料夾', icon: 'folderPlus', onClick: () => onCreate(folder.id) },
                { label: '重新命名', icon: 'edit', onClick: () => onRename(folder) },
                { separator: true },
                { label: '刪除', icon: 'trash', tone: 'danger', onClick: () => onDelete(folder) },
              ]}
            />
          </div>
          {kids.length > 0 && isOpen && (
            <ul className="folder-sublist">{renderLevel(folder.id, depth + 1)}</ul>
          )}
        </li>
      );
    });

  return (
    <div className="folder-tree-wrap">
      <ul className="folder-tree">
        <li>
          <div className={`folder-row ${currentId === null ? 'is-active' : ''}`} style={{ paddingLeft: '8px' }}>
            <span className="folder-caret is-empty" />
            <button type="button" className="folder-name" onClick={() => onSelect(null)}>
              <Icon name="grid" size={14} />
              <span>全部檔案</span>
              {stats?.rootFileCount > 0 && <em>{stats.rootFileCount}</em>}
            </button>
          </div>
        </li>
        {renderLevel('root', 0)}
      </ul>

      <div className="folder-usage">
        <div>
          <span>檔案</span>
          <strong>{stats?.fileCount ?? 0}</strong>
        </div>
        <div>
          <span>資料夾</span>
          <strong>{stats?.folderCount ?? 0}</strong>
        </div>
        <div>
          <span>已使用</span>
          <strong>{formatBytes(stats?.totalSize ?? 0)}</strong>
        </div>
      </div>
    </div>
  );
}