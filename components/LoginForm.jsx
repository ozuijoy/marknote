'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Icon, Logo } from './Icons';
import { useTheme } from '@/lib/theme';

/** 登入畫面：單一密碼（由環境變數 APP_PASSWORD 控制） */
export default function LoginForm({ appName = 'MarkNote' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const { theme, resolved, cycle } = useTheme();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('expired')) setNotice('登入狀態已失效，請重新輸入密碼。');
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api.login(password);
      if (res?.db && res.db.ok === false) {
        setError(`已登入，但資料庫連線失敗：${res.db.error}`);
      }
      window.location.href = '/';
    } catch (err) {
      setError(err.message || '登入失敗');
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <button
        type="button"
        className="icon-btn login-theme"
        onClick={cycle}
        title={`主題：${theme === 'system' ? '跟隨系統' : theme === 'dark' ? '深色' : '淺色'}`}
        aria-label="切換主題"
      >
        <Icon name={resolved === 'dark' ? 'moon' : theme === 'system' ? 'monitor' : 'sun'} size={17} />
      </button>

      <form className="login-card" onSubmit={submit}>
        <span className="login-logo">
          <Logo size={30} />
        </span>
        <h1>{appName}</h1>
        <p className="login-sub">輸入密碼以進入你的筆記工作區</p>

        <label className="field">
          <span className="field-label sr-only">密碼</span>
          <span className="input-with-icon">
            <Icon name="lock" size={15} />
            <input
              type={show ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              autoFocus
              placeholder="存取密碼"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn icon-btn-xs"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? '隱藏密碼' : '顯示密碼'}
              tabIndex={-1}
            >
              <Icon name={show ? 'eye' : 'lock'} size={14} />
            </button>
          </span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            <Icon name="warning" size={14} />
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="form-notice" role="status">
            <Icon name="info" size={14} />
            {notice}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? (
            <>
              <span className="spinner" />
              驗證中…
            </>
          ) : (
            <>
              <Icon name="logout" size={15} />
              進入工作區
            </>
          )}
        </button>

        <p className="login-hint">
          密碼由部署時的環境變數 <code>APP_PASSWORD</code> 控制，資料存放於 Neon Postgres。
        </p>
      </form>
    </main>
  );
}
