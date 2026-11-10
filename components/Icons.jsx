/**
 * 精簡 SVG 圖示組（stroke 風格，跟隨 currentColor）。
 * 用法：<Icon name="search" size={16} />
 */

const PATHS = {
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
  folderPlus: (
    <>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  move: (
    <>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M9 13h6M13 10l3 3-3 3" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12.5V4h8.5L21 13.5 12.5 22 3 12.5z" />
      <circle cx="7.5" cy="8" r="1.2" />
    </>
  ),
  hash: <path d="M5 9h14M5 15h14M10 4l-1.5 16M16 4l-1.5 16" />,
  note: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  notes: (
    <>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
    </>
  ),
  pin: <path d="M9 3h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 13v8" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  dots: <path d="M12 6v.01M12 12v.01M12 18v.01" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  logout: <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h11" />,
  edit: <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  bold: <path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />,
  italic: <path d="M10 5h7M7 19h7M14 5l-4 14" />,
  strikethrough: <path d="M5 12h14M7.5 8.5A3.5 3.5 0 0111 5h2a3.5 3.5 0 013.4 2.6M7 16.2A3.5 3.5 0 0010.5 19h3a3.5 3.5 0 003.3-4.6" />,
  heading: <path d="M6 5v14M18 5v14M6 12h12" />,
  heading1: <path d="M5 6v12M15 6v12M5 12h10M19 9l2-1v10" />,
  heading2: <path d="M4 6v12M12 6v12M4 12h8M16 8.5A2.5 2.5 0 0120.5 10c0 2-4.5 3.5-4.5 8h5" />,
  heading3: <path d="M4 6v12M12 6v12M4 12h8M16 7.5h4.5l-2.5 4a2.6 2.6 0 11-1.6 4.4" />,
  link: <path d="M10 13.5a4 4 0 005.7 0l2.6-2.6a4 4 0 10-5.7-5.7L11.4 6.4M14 10.5a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 105.7 5.7l1.2-1.2" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 18l5-4 3.5 3 3-2.5L20 18" />
    </>
  ),
  audio: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 11l5-3v8l-5-3z" />
    </>
  ),
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  codeBlock: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 9l-2 3 2 3M14 9l2 3-2 3" />
    </>
  ),
  quote: <path d="M7 7h4v4a4 4 0 01-4 4V7zM15 7h4v4a4 4 0 01-4 4V7z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  listOrdered: <path d="M10 6h10M10 12h10M10 18h10M4 5h1.5v4M4 9h2.5M4 14.5h2.5L4 18h2.6" />,
  todo: (
    <>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="13" width="7" height="7" rx="1.5" />
      <path d="M13 7.5h8M13 16.5h8" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M9 10v9M15 10v9" />
    </>
  ),
  hr: <path d="M4 12h16" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a2 2 0 00-2 2v9" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  external: <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  refresh: <path d="M20 12a8 8 0 10-2.6 5.9M20 6v6h-6" />,
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
    </>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 18v1a2 2 0 002 2h12a2 2 0 002-2v-1" />,
  warning: (
    <>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  play: <path d="M7 4.5l12 7.5-12 7.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  sort: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  drag: <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
};

export function Icon({ name, size = 16, className = '', strokeWidth = 1.8, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
}

export function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo-mark">
      <rect x="2.5" y="3" width="19" height="18" rx="4.5" fill="currentColor" opacity="0.14" />
      <path
        d="M7 16.5V8l3.4 4.6L13.8 8v8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.4 8.2v8.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
