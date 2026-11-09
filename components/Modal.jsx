'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { useClickOutside } from '@/hooks';

/** 通用彈窗：Escape 關閉、背景點擊關閉、鎖定背景捲動 */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 460 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => {
      const focusable = ref.current?.querySelector('input,textarea,button,[tabindex]');
      focusable?.focus?.();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{ maxWidth: width }}
        ref={ref}
      >
        {(title || subtitle) && (
          <header className="modal-head">
            <div>
              {title && <h2>{title}</h2>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
              <Icon name="close" size={16} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** 確認對話框 */
export function ConfirmDialog({
  open,
  title = '確定要執行嗎？',
  description,
  confirmLabel = '確定',
  cancelLabel = '取消',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={420}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn btn-${tone}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {description && <p className="modal-text">{description}</p>}
    </Modal>
  );
}

/** 表單式輸入對話框（單一或多個欄位） */
export function PromptDialog({
  open,
  title,
  subtitle,
  fields = [],
  confirmLabel = '確定',
  cancelLabel = '取消',
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // 只在「開啟當下」初始化欄位值；父元件每次 render 傳入的新陣列不會重置輸入
  useEffect(() => {
    if (!open) return;
    const initial = {};
    fieldsRef.current.forEach((f) => {
      initial[f.name] = f.value ?? '';
    });
    setValues(initial);
    setError('');
  }, [open]);

  const submit = (e) => {
    e?.preventDefault?.();
    for (const f of fields) {
      if (f.required && !String(values[f.name] ?? '').trim()) {
        setError(f.requiredMessage || `請輸入${f.label}`);
        return;
      }
    }
    setError('');
    onSubmit?.(values);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      subtitle={subtitle}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={submit}>
        {fields.map((f) => (
          <label className="field" key={f.name}>
            <span className="field-label">{f.label}</span>
            {f.type === 'textarea' ? (
              <textarea
                rows={f.rows || 3}
                value={values[f.name] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
                }}
              />
            ) : f.type === 'select' ? (
              <select
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              >
                {(f.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type || 'text'}
                value={values[f.name] ?? ''}
                placeholder={f.placeholder}
                autoFocus={f.autoFocus !== false}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit(e);
                }}
              />
            )}
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </label>
        ))}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

/** 下拉選單 */
export function Menu({ label, icon, items, align = 'right', buttonClassName = 'icon-btn', title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`menu-wrap ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title || label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {icon && <Icon name={icon} size={16} />}
        {label && <span>{label}</span>}
      </button>
      {open && (
        <div className={`menu menu-${align}`} role="menu" onMouseDown={(e) => e.stopPropagation()}>
          {items.map((item, i) =>
            item.separator ? (
              <div className="menu-sep" key={`sep-${i}`} />
            ) : (
              <button
                type="button"
                key={item.key || item.label || i}
                role="menuitem"
                className={`menu-item ${item.tone ? `tone-${item.tone}` : ''} ${item.active ? 'is-active' : ''}`}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon && <Icon name={item.icon} size={15} />}
                <span className="menu-item-label">{item.label}</span>
                {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
                {item.active && <Icon name="check" size={14} />}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** 全域 Toast */
export function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type || 'info'}`} role="status" onClick={onDismiss}>
      <Icon name={toast.type === 'error' ? 'warning' : toast.type === 'success' ? 'check' : 'info'} size={15} />
      <span>{toast.message}</span>
    </div>
  );
}
