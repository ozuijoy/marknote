'use client';

import { useEffect, useState } from 'react';

/** localStorage 同步的 state（JSON 序列化） */
export function useLocalState(key, initialValue) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      /* 忽略：私密模式或損壞的資料 */
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 忽略寫入失敗（例如配额滿了） */
    }
  }, [key, value]);

  return [value, setValue];
}

/** 響應式 media query */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** 防抖 */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** 點擊元素外部時觸發（用於下拉選單） */
export function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (event) => {
      const el = ref.current;
      if (!el || el.contains(event.target)) return;
      onOutside(event);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [ref, onOutside]);
}
