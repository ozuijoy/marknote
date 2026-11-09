'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { colorFor } from '@/lib/format';

/**
 * 標籤選擇器：勾選既有標籤，或直接輸入建立新標籤。
 * onChange 回傳「標籤名稱」陣列（伺服器端會自動建立不存在的標籤）。
 */
export default function TagPicker({ allTags = [], selected = [], onChange, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedLower = selected.map((s) => s.toLowerCase());

  const toggle = (name) => {
    const key = name.toLowerCase();
    if (selectedLower.includes(key)) onChange(selected.filter((s) => s.toLowerCase() !== key));
    else onChange([...selected, name]);
  };

  const addDraft = () => {
    const name = draft.trim().replace(/^#/, '').slice(0, 40);
    if (!name) return;
    if (!selectedLower.includes(name.toLowerCase())) onChange([...selected, name]);
    setDraft('');
  };

  const suggestions = allTags.filter((t) => !selectedLower.includes(t.name.toLowerCase())).slice(0, 30);

  return (
    <div className={`tag-picker ${open ? 'is-open' : ''} align-${align}`} ref={ref}>
      <button
        type="button"
        className="tag-picker-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="編輯標籤"
      >
        <Icon name="tag" size={14} />
        <span>{selected.length ? `${selected.length} 個標籤` : '標籤'}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
      </button>

      {open && (
        <div className="tag-picker-panel" role="dialog" aria-label="選擇標籤">
          <div className="tag-picker-input">
            <Icon name="hash" size={14} />
            <input
              ref={inputRef}
              value={draft}
              placeholder="輸入並按下 Enter 建立新標籤"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                }
                if (e.key === 'Backspace' && !draft && selected.length) {
                  onChange(selected.slice(0, -1));
                }
              }}
            />
            {draft && (
              <button type="button" className="btn btn-xs" onClick={addDraft}>
                建立 #{draft.trim().replace(/^#/, '')}
              </button>
            )}
          </div>

          {selected.length > 0 && (
            <div className="tag-picker-section">
              <span className="tag-picker-label">已選</span>
              <div className="tag-picker-chips">
                {selected.map((name) => {
                  const known = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
                  const palette = colorFor(known?.color || name);
                  return (
                    <button
                      type="button"
                      key={name}
                      className="tag-chip is-active"
                      style={{ background: known?.color || palette.bg, color: known?.color ? '#fff' : palette.fg }}
                      onClick={() => toggle(name)}
                      title="點擊移除"
                    >
                      #{name}
                      <Icon name="close" size={11} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="tag-picker-section">
            <span className="tag-picker-label">所有標籤</span>
            {suggestions.length === 0 ? (
              <p className="tag-picker-empty">沒有其他標籤</p>
            ) : (
              <ul className="tag-picker-list">
                {suggestions.map((t) => {
                  const palette = colorFor(t.color || t.name);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => toggle(t.name)}>
                        <span className="dot" style={{ background: t.color || palette.fg }} />
                        <span className="name">#{t.name}</span>
                        <span className="count">{Number(t.note_count) || 0}</span>
                        <Icon name="plus" size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
