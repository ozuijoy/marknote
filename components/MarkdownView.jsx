'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { Icon } from './Icons';
import { buildSanitizeSchema, classifyMediaUrl, isAllowedEmbedHost, isSafeMediaUrl, resolveEmbed } from '@/lib/media';

/**
 * 閱讀模式的 Markdown 渲染器。
 * 特色：外鏈圖片可點擊放大、音訊／影片直接内嵌播放、
 * YouTube / Vimeo / Bilibili 連結自動轉為内嵌播放器，
 * 原始 HTML 媒體標籤（<img>/<audio>/<video>/<iframe>）在白名單内亦可顯示。
 */

const sanitizeSchema = buildSanitizeSchema();

function nodeText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  return node.value || '';
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="code-copy" onClick={copy} title="複製程式碼">
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? '已複製' : '複製'}
    </button>
  );
}

function ZoomableImage({ src, alt, title }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);

  if (!isSafeMediaUrl(src, { allowDataImage: true }) || failed) {
    return (
      <span className="media-fallback">
        <Icon name="image" size={14} />
        <span>圖片無法顯示</span>
        {src ? (
          <a href={src} target="_blank" rel="noopener noreferrer">
            開啟原圖 <Icon name="external" size={12} />
          </a>
        ) : null}
      </span>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={alt || ''}
        title={title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="md-image"
        onError={() => setFailed(true)}
        onClick={() => setZoom(true)}
      />
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)} role="dialog" aria-label="圖片檢視">
          <button type="button" className="lightbox-close" aria-label="關閉">
            <Icon name="close" size={20} />
          </button>
          <img src={src} alt={alt || ''} onClick={(e) => e.stopPropagation()} />
          {alt && <div className="lightbox-caption">{alt}</div>}
        </div>
      )}
    </>
  );
}

function AudioPlayer({ src, label }) {
  const [failed, setFailed] = useState(false);
  if (!isSafeMediaUrl(src) || failed) return <BrokenMedia kind="音訊" src={src} />;
  return (
    <span className="media-block">
      {label && <span className="media-label"><Icon name="audio" size={13} />{label}</span>}
      <audio controls preload="metadata" src={src} onError={() => setFailed(true)}>
        您的瀏覽器不支援音訊播放。
        <a href={src} target="_blank" rel="noopener noreferrer">下載音訊</a>
      </audio>
    </span>
  );
}

function VideoPlayer({ src, poster, label }) {
  const [failed, setFailed] = useState(false);
  if (!isSafeMediaUrl(src) || failed) return <BrokenMedia kind="影片" src={src} />;
  return (
    <span className="media-block">
      {label && <span className="media-label"><Icon name="video" size={13} />{label}</span>}
      <video
        controls
        playsInline
        preload="metadata"
        src={src}
        poster={poster && isSafeMediaUrl(poster) ? poster : undefined}
        onError={() => setFailed(true)}
      >
        您的瀏覽器不支援影片播放。
        <a href={src} target="_blank" rel="noopener noreferrer">下載影片</a>
      </video>
    </span>
  );
}

function BrokenMedia({ kind, src }) {
  return (
    <span className="media-fallback">
      <Icon name="warning" size={14} />
      <span>{kind}無法播放</span>
      {src ? (
        <a href={src} target="_blank" rel="noopener noreferrer">
          開啟連結 <Icon name="external" size={12} />
        </a>
      ) : null}
    </span>
  );
}

function EmbedFrame({ embed, fallbackHref }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="md-link" href={fallbackHref} target="_blank" rel="noopener noreferrer">
        {fallbackHref} <Icon name="external" size={12} />
      </a>
    );
  }
  return (
    <span className="embed-frame" style={{ aspectRatio: embed.ratio }}>
      <iframe
        src={embed.src}
        title={`${embed.label} 播放器`}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onError={() => setFailed(true)}
      />
      <span className="embed-badge">{embed.label}</span>
    </span>
  );
}

export default function MarkdownView({ content = '', embedHosts = [], className = '' }) {
  const text = typeof content === 'string' ? content : '';

  const components = useMemo(
    () => ({
      img: ({ src, alt, title }) => {
        const kind = classifyMediaUrl(src, embedHosts);
        if (kind === 'audio') return <AudioPlayer src={src} label={alt || '音訊'} />;
        if (kind === 'video') return <VideoPlayer src={src} label={alt || '影片'} />;
        return <ZoomableImage src={src} alt={alt} title={title} />;
      },
      a: ({ href, children, node }) => {
        const embed = resolveEmbed(href, embedHosts);
        const raw = nodeText(node);
        // 單獨一行的影音連結 → 直接内嵌播放器（Notion 風格）
        if (embed && (!children || raw === href || raw.trim() === href)) {
          return <EmbedFrame embed={embed} fallbackHref={href} />;
        }
        const kind = classifyMediaUrl(href, embedHosts);
        if (kind === 'audio') return <AudioPlayer src={href} label={raw || '音訊'} />;
        if (kind === 'video') return <VideoPlayer src={href} label={raw || '影片'} />;
        if (embed) {
          return (
            <a className="md-link md-link-embed" href={href} target="_blank" rel="noopener noreferrer">
              <Icon name="play" size={12} />
              {children}
              <span className="link-host">{embed.label}</span>
            </a>
          );
        }
        return (
          <a className="md-link" href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
            {href && /^https?:/i.test(href) && <Icon name="external" size={12} className="link-external" />}
          </a>
        );
      },
      audio: ({ src, node }) => {
        const source = src || nodeText(node);
        return <AudioPlayer src={source} />;
      },
      video: ({ src, poster, node }) => {
        const source = src || nodeText(node);
        return <VideoPlayer src={source} poster={poster} />;
      },
      iframe: ({ src, title }) => {
        if (!isAllowedEmbedHost(src, embedHosts)) {
          return (
            <a className="md-link" href={src} target="_blank" rel="noopener noreferrer">
              {title || src} <Icon name="external" size={12} />
            </a>
          );
        }
        return (
          <span className="embed-frame" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              src={src}
              title={title || '内嵌內容'}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </span>
        );
      },
      pre: ({ children, node }) => {
        const code = node?.children?.find?.((c) => c.tagName === 'code');
        const lang = (code?.properties?.className || [])
          .map((c) => String(c))
          .find((c) => c.startsWith('language-'))
          ?.replace('language-', '');
        return (
          <div className="code-block">
            <div className="code-head">
              <span className="code-lang">{lang || 'text'}</span>
              <CopyButton text={nodeText(code)} />
            </div>
            <pre>{children}</pre>
          </div>
        );
      },
      table: ({ children }) => (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      ),
      input: ({ type, checked, ...rest }) =>
        type === 'checkbox' ? (
          <input type="checkbox" checked={Boolean(checked)} readOnly disabled {...rest} className="task-checkbox" />
        ) : null,
      blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
      hr: () => <hr className="md-hr" />,
    }),
    [embedHosts],
  );

  if (!text.trim()) {
    return (
      <div className={`markdown-body markdown-empty ${className}`.trim()}>
        <Icon name="note" size={28} />
        <p>這篇筆記還沒有內容。</p>
        <p className="hint">切換到「編輯」開始撰寫，或貼上包含圖片、音訊、影片連結的 Markdown。</p>
      </div>
    );
  }

  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeHighlight]}
        components={components}
        skipHtml={false}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
