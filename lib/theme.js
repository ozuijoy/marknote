'use client';

import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'mn.theme';

/** 讀取儲存的主題偏好：light | dark | system */
export function readStoredTheme() {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** 解析 system 偏好為實際主题 */
export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 套用主題到 <html data-theme> */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

/**
 * 主題 hook：light / dark / system 循環切換，並跟隨系統變化。
 * @returns {{theme: string, resolved: string, setTheme: Function, cycle: Function}}
 */
export function useTheme() {
  const [theme, setThemeState] = useState('system');
  const [resolved, setResolved] = useState('light');

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
    setResolved(resolveTheme(stored));

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = readStoredTheme();
      if (current === 'system') {
        applyTheme('system');
        setResolved(resolveTheme('system'));
      }
    };
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    window.localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
    applyTheme(next);
    setResolved(resolveTheme(next));
  }, []);

  const cycle = useCallback(() => {
    const order = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(readStoredTheme()) + 1) % order.length];
    setTheme(next);
  }, [setTheme]);

  return { theme, resolved, setTheme, cycle };
}

/** 防閃爍用的 inline script（在 <head> 最早期執行） */
export const THEME_INIT_SCRIPT = `(function(){try{
  var t=localStorage.getItem('${THEME_KEY}')||'system';
  var d=(t==='dark')||(t!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var r=d?'dark':'light';
  var e=document.documentElement;
  e.setAttribute('data-theme',r);
  e.style.colorScheme=r;
}catch(err){document.documentElement.setAttribute('data-theme','light');}})();`;
