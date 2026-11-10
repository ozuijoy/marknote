'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { Modal } from './Modal';
import { formatBytes, formatDateTime } from '@/lib/format';
import { mediaKind } from '@/lib/file-utils';

/** 檔案預覽：圖片／影片／音訊／PDF／純文字，其餘提供下載 */
export default function FilePreview({ file, onClose }) {
  const [text, setText] = useState('');
  const [textError, setTextError] = useState('');
  const kind = file ? mediaKind(file.mime, file.name) : 'other';

  useEffect(() => {
    setText('');
    setTextError('');
    if (!file || kind !== 'text') return undefined;
    const controller = new AbortController();
    fetch(file.rawUrl, { credentials: 'same-origin', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((body) => setText(body.slice(0, 200_000)))
      .catch((err) => {
        if (err.name !== 'AbortError') setTextError('無法載入文字內容');
      });
    return () => controller.abort();
  }, [file, kind]);

  if (!file) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={file.name}
      subtitle={`${formatBytes(file.size)} · ${formatDateTime(file.created_at)}`}
      width={860}
      footer={
        <>
          <a className="btn" href={file.downloadUrl} download>
            <Icon name="download" size={15} />
            下載
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            關閉
          </button>
        </>
      }
    >
      <div className={`file-preview is-${kind}`}>
        {kind === 'image' && <img src={file.rawUrl} alt={file.name} className="preview-image" />}
        {kind === 'video' && <video src={file.rawUrl} controls playsInline preload="metadata" className="preview-video" />}
        {kind === 'audio' && (
          <div className="preview-audio">
            <Icon name="audio" size={34} />
            <audio src={file.rawUrl} controls preload="metadata" />
          </div>
        )}
        {kind === 'pdf' && <iframe src={file.rawUrl} title={file.name} className="preview-pdf" />}
        {kind === 'text' && (
          <div className="preview-text">
            {textError ? <p className="form-error">{textError}</p> : <pre>{text || '（空白檔案）'}</pre>}
          </div>
        )}
        {kind === 'other' && (
          <div className="preview-other">
            <Icon name="file" size={40} />
            <p>這種檔案型別無法預覽，請下載後開啟。</p>
            <a className="btn btn-primary" href={file.downloadUrl} download>
              <Icon name="download" size={15} />
              下載檔案
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}