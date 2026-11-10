'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FolderTree from './FolderTree';
import FilePreview from './FilePreview';
import { Icon } from './Icons';
import { ConfirmDialog, Menu, PromptDialog } from './Modal';
import { api } from '@/lib/client';
import { uploadFile } from '@/lib/upload';
import { formatBytes, formatDateTime } from '@/lib/format';
import { mediaKind } from '@/lib/file-utils';
import { useMediaQuery } from '@/hooks';

const ICON_BY_KIND = { image: 'image', audio: 'audio', video: 'video', pdf: 'file', text: 'file', other: 'file' };

function kindIcon(file) {
  return ICON_BY_KIND[mediaKind(file.mime, file.name)] || 'file';
}

/** 檔案庫：資料夾樹 + 檔案格狀清單 + 拖放上傳 + 預覽／移動／刪除 */
export default function FileManager({ onBackToNotes, notify }) {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [storage, setStorage] = useState(null);
  const [folders, setFolders] = useState([]);
  const [stats, setStats] = useState(null);
  const [folderId, setFolderId] = useState(null);
  const [path, setPath] = useState([]);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [dialog, setDialog] = useState(null);

  const configured = Boolean(storage?.configured);
  const maxBytes = storage?.maxUploadBytes || 200 * 1024 * 1024;

  // ── 初始載入：儲存設定 + 資料夾樹 ──────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, f] = await Promise.all([api.storageStatus(), api.listFolders()]);
        if (!alive) return;
        setStorage(s);
        setFolders(f.folders || []);
        setStats(f.stats || null);
        setStatus('ready');
      } catch (err) {
        if (!alive) return;
        setStatus('error');
        setError(err?.message || '載入檔案庫失敗');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshFolders = useCallback(async () => {
    const res = await api.listFolders();
    setFolders(res.folders || []);
    setStats(res.stats || null);
    return res;
  }, []);

  // ── 切換資料夾時載入檔案 ───────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return undefined;
    let alive = true;
    setFilesLoading(true);
    api
      .listFiles(folderId)
      .then((res) => {
        if (!alive) return;
        setFiles(res.files || []);
        setPath(res.path || []);
        if (res.stats) setStats(res.stats);
      })
      .catch((err) => {
        if (alive) notify(err.message || '載入檔案失敗', 'error');
      })
      .finally(() => {
        if (alive) setFilesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [folderId, status, notify]);

  // ── 上傳 ──────────────────────────────────────────────────────────────
  const startUpload = useCallback(
    async (fileList) => {
      const list = Array.from(fileList || []);
      if (!list.length) return;
      if (!configured) {
        notify('尚未設定物件儲存，無法上傳', 'error');
        return;
      }

      const accepted = [];
      for (const file of list) {
        if (!file.size) {
          notify(`${file.name} 是空檔案，已略過`, 'error');
          continue;
        }
        if (file.size > maxBytes) {
          notify(`${file.name} 超過單檔 ${formatBytes(maxBytes)} 上限`, 'error');
          continue;
        }
        accepted.push(file);
      }
      if (!accepted.length) return;

      let okCount = 0;
      for (const file of accepted) {
        const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setUploads((prev) => [...prev, { key, name: file.name, size: file.size, progress: 0, status: 'uploading' }]);
        try {
          const record = await uploadFile(file, {
            folderId,
            onProgress: (ratio) =>
              setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress: ratio } : u))),
          });
          okCount += 1;
          setUploads((prev) =>
            prev.map((u) => (u.key === key ? { ...u, status: 'done', progress: 1, id: record.id } : u)),
          );
          if ((record.folder_id || null) === (folderId || null)) {
            setFiles((prev) => [...prev, record].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')));
          }
        } catch (err) {
          setUploads((prev) =>
            prev.map((u) => (u.key === key ? { ...u, status: 'error', error: err.message || '上傳失敗' } : u)),
          );
        }
      }

      if (okCount) {
        notify(`已上傳 ${okCount} 個檔案`, 'success');
        refreshFolders().catch(() => {});
      } else {
        notify('上傳失敗，請稍後再試', 'error');
      }
    },
    [configured, folderId, maxBytes, notify, refreshFolders],
  );

  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (e.dataTransfer?.files?.length) startUpload(e.dataTransfer.files);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  // ── 資料夾操作 ────────────────────────────────────────────────────────
  const descendantsOf = useCallback(
    (id) => {
      const out = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of folders) {
          if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
            out.add(f.id);
            changed = true;
          }
        }
      }
      return out;
    },
    [folders],
  );

  const subtreeSummary = useCallback(
    (id) => {
      const ids = descendantsOf(id);
      const selected = folders.filter((f) => ids.has(f.id));
      const fileCount = selected.reduce((sum, f) => sum + (f.file_count || 0), 0);
      const totalSize = selected.reduce((sum, f) => sum + (f.total_size || 0), 0);
      return { fileCount, totalSize, folderCount: ids.size };
    },
    [descendantsOf, folders],
  );

  const submitNewFolder = async ({ name }) => {
    const parentId = dialog?.parentId ?? null;
    setDialog(null);
    try {
      await api.createFolder({ name, parentId });
      await refreshFolders();
      notify('已建立資料夾', 'success');
      if (!parentId) setFolderId(null);
    } catch (err) {
      notify(err.message || '建立資料夾失敗', 'error');
    }
  };

  const submitRenameFolder = async ({ name }) => {
    const folder = dialog?.folder;
    setDialog(null);
    if (!folder) return;
    try {
      await api.updateFolder(folder.id, { name });
      await refreshFolders();
    } catch (err) {
      notify(err.message || '重新命名失敗', 'error');
    }
  };

  const confirmDeleteFolder = async (folder) => {
    const info = subtreeSummary(folder.id);
    setDialog(null);
    try {
      await api.deleteFolder(folder.id, { recursive: info.fileCount > 0 || info.folderCount > 1 });
      await refreshFolders();
      const gone = descendantsOf(folder.id);
      if (folderId && gone.has(folderId)) setFolderId(null);
      else if (folderId) await api.listFiles(folderId).then((res) => setFiles(res.files || []));
      notify('已刪除資料夾', 'success');
    } catch (err) {
      notify(err.message || '刪除資料夾失敗', 'error');
    }
  };

  const submitCreateChild = (parentId) => setDialog({ type: 'newFolder', parentId });

  // ── 檔案操作 ──────────────────────────────────────────────────────────
  const submitRenameFile = async ({ name }) => {
    const file = dialog?.file;
    setDialog(null);
    if (!file) return;
    try {
      const res = await api.updateFile(file.id, { name });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? res.file : f)));
      notify('已重新命名', 'success');
    } catch (err) {
      notify(err.message || '重新命名失敗', 'error');
    }
  };

  const submitMoveFile = async ({ folderId: target }) => {
    const file = dialog?.file;
    setDialog(null);
    if (!file) return;
    try {
      await api.updateFile(file.id, { folderId: target || null });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      await refreshFolders();
      notify('已移動檔案', 'success');
    } catch (err) {
      notify(err.message || '移動失敗', 'error');
    }
  };

  const confirmDeleteFile = async (file) => {
    setDialog(null);
    try {
      await api.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      await refreshFolders();
      notify('已刪除檔案', 'success');
    } catch (err) {
      notify(err.message || '刪除失敗', 'error');
    }
  };

  // 移動對話框的資料夾選項（含縮排）
  const folderOptions = useMemo(() => {
    const byParent = new Map();
    for (const f of folders) {
      const key = f.parent_id || 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(f);
    }
    const options = [{ value: '', label: '根目錄' }];
    const walk = (parent, depth) => {
      for (const f of byParent.get(parent) || []) {
        options.push({ value: f.id, label: `${'　'.repeat(depth)}${f.name}` });
        walk(f.id, depth + 1);
      }
    };
    walk('root', 0);
    return options;
  }, [folders]);

  // ── 畫面 ──────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="files-screen">
        <div className="files-loading">
          <span className="spinner" />
          載入檔案庫…
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="files-screen">
        <div className="files-loading">
          <Icon name="warning" size={26} />
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={15} />
            重新載入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="files-screen">
      <header className="files-head">
        <button type="button" className="btn files-back" onClick={onBackToNotes}>
          <Icon name="arrowLeft" size={15} />
          筆記
        </button>

        <div className="files-title">
          <Icon name="folder" size={18} />
          <strong>檔案庫</strong>
          {storage?.bucket && <span className="files-bucket">{storage.bucket}</span>}
        </div>

        <div className="files-head-actions">
          {isMobile && (
            <button
              type="button"
              className="btn"
              aria-label="資料夾"
              onClick={() => setFoldersOpen((v) => !v)}
            >
              <Icon name="folder" size={15} />
              <span className="files-action-label">資料夾</span>
            </button>
          )}
          <button
            type="button"
            className="btn"
            aria-label="新增資料夾"
            onClick={() => setDialog({ type: 'newFolder', parentId: folderId })}
            disabled={!configured}
          >
            <Icon name="folderPlus" size={15} />
            <span className="files-action-label">新增資料夾</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-label="上傳檔案"
            onClick={() => inputRef.current?.click()}
            disabled={!configured}
          >
            <Icon name="upload" size={15} />
            <span className="files-action-label">上傳檔案</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            startUpload(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      <div className={`files-body ${foldersOpen ? 'show-folders' : ''}`}>
        {isMobile && foldersOpen && (
          <button
            type="button"
            className="files-scrim"
            aria-label="關閉資料夾面板"
            onClick={() => setFoldersOpen(false)}
          />
        )}
        <aside className="files-folders">
          <FolderTree
            folders={folders}
            stats={stats}
            currentId={folderId}
            onSelect={(id) => {
              setFolderId(id);
              if (isMobile) setFoldersOpen(false);
            }}
            onCreate={submitCreateChild}
            onRename={(folder) => setDialog({ type: 'renameFolder', folder })}
            onDelete={(folder) => setDialog({ type: 'deleteFolder', folder })}
          />
        </aside>

        <main
          className="files-main"
          onDragEnter={onDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="files-breadcrumb">
            <button type="button" className={folderId ? '' : 'is-current'} onClick={() => setFolderId(null)}>
              全部檔案
            </button>
            {path.map((p) => (
              <span key={p.id} className="crumb">
                <Icon name="chevronRight" size={12} />
                <button type="button" className={p.id === folderId ? 'is-current' : ''} onClick={() => setFolderId(p.id)}>
                  {p.name}
                </button>
              </span>
            ))}
            <span className="files-count">{files.length} 個檔案</span>
          </div>

          {uploads.length > 0 && (
            <div className="upload-queue">
              <div className="upload-queue-head">
                <span>上傳佇列</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setUploads((prev) => prev.filter((u) => u.status === 'uploading'))}
                >
                  清除已完成
                </button>
              </div>
              {uploads.map((u) => (
                <div className={`upload-row is-${u.status}`} key={u.key}>
                  <Icon name={u.status === 'done' ? 'check' : u.status === 'error' ? 'warning' : 'upload'} size={14} />
                  <span className="upload-name" title={u.name}>
                    {u.name}
                  </span>
                  <span className="upload-bar">
                    <span style={{ width: `${Math.round((u.progress || 0) * 100)}%` }} />
                  </span>
                  <span className="upload-state">
                    {u.status === 'error' ? u.error : u.status === 'done' ? formatBytes(u.size) : `${Math.round((u.progress || 0) * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!configured ? (
            <div className="files-setup">
              <Icon name="warning" size={26} />
              <h2>尚未連接物件儲存</h2>
              <p>檔案庫使用與 Neon 資料庫同一個專案的 Neon Object Storage。設定以下環境變數後即可使用：</p>
              <ul>
                <li><code>AWS_ENDPOINT_URL_S3</code>：分支的儲存端點</li>
                <li><code>AWS_ACCESS_KEY_ID</code>／<code>AWS_SECRET_ACCESS_KEY</code>：儲存憑證</li>
                <li><code>AWS_REGION</code>：例如 <code>aws-ap-southeast-1</code></li>
                <li><code>STORAGE_BUCKET</code>：bucket 名稱</li>
              </ul>
              <p className="files-setup-hint">
                執行 <code>npm run storage:init</code> 可自動建立 bucket 並設定 CORS。筆記功能不受影響。
              </p>
            </div>
          ) : filesLoading ? (
            <div className="files-loading">
              <span className="spinner" />
              載入中…
            </div>
          ) : files.length === 0 ? (
            <button type="button" className="files-empty" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={30} />
              <h2>把檔案拖進來，或點此上傳</h2>
              <p>圖片、音訊、影片、PDF、文件都可以；單檔上限 {formatBytes(maxBytes)}。</p>
            </button>
          ) : (
            <div className="file-grid">
              {files.map((file) => (
                <article className="file-card" key={file.id}>
                  <button
                    type="button"
                    className="file-thumb"
                    onClick={() => setDialog({ type: 'preview', file })}
                    title={`預覽 ${file.name}`}
                  >
                    {mediaKind(file.mime, file.name) === 'image' ? (
                      <img src={file.rawUrl} alt="" loading="lazy" />
                    ) : (
                      <Icon name={kindIcon(file)} size={26} />
                    )}
                  </button>
                  <div className="file-info">
                    <button
                      type="button"
                      className="file-name"
                      title={file.name}
                      onClick={() => setDialog({ type: 'preview', file })}
                    >
                      {file.name}
                    </button>
                    <span className="file-sub">
                      {formatBytes(file.size)} · {formatDateTime(file.created_at)}
                    </span>
                  </div>
                  <Menu
                    icon="more"
                    title="檔案選項"
                    buttonClassName="icon-btn icon-btn-xs"
                    items={[
                      { label: '預覽', icon: 'eye', onClick: () => setDialog({ type: 'preview', file }) },
                      { label: '下載', icon: 'download', onClick: () => window.open(file.downloadUrl, '_blank') },
                      { label: '移動到…', icon: 'move', onClick: () => setDialog({ type: 'moveFile', file }) },
                      { label: '重新命名', icon: 'edit', onClick: () => setDialog({ type: 'renameFile', file }) },
                      { separator: true },
                      { label: '刪除', icon: 'trash', tone: 'danger', onClick: () => setDialog({ type: 'deleteFile', file }) },
                    ]}
                  />
                </article>
              ))}
            </div>
          )}

          {dragActive && (
            <div className="drop-overlay">
              <Icon name="upload" size={28} />
              <strong>放開即可上傳</strong>
              <span>一次可以拖入多個檔案</span>
            </div>
          )}
        </main>
      </div>

      {/* ── 對話框 ─────────────────────────────────────────────────────── */}
      <PromptDialog
        open={dialog?.type === 'newFolder'}
        title="新增資料夾"
        fields={[{ name: 'name', label: '資料夾名稱', placeholder: '例如：專案素材', required: true }]}
        confirmLabel="建立"
        onSubmit={submitNewFolder}
        onCancel={() => setDialog(null)}
      />

      <PromptDialog
        open={dialog?.type === 'renameFolder'}
        title="重新命名資料夾"
        fields={[{ name: 'name', label: '資料夾名稱', value: dialog?.folder?.name || '', required: true }]}
        onSubmit={submitRenameFolder}
        onCancel={() => setDialog(null)}
      />

      <PromptDialog
        open={dialog?.type === 'renameFile'}
        title="重新命名檔案"
        subtitle={dialog?.file?.name}
        fields={[{ name: 'name', label: '檔名', value: dialog?.file?.name || '', required: true }]}
        onSubmit={submitRenameFile}
        onCancel={() => setDialog(null)}
      />

      <PromptDialog
        open={dialog?.type === 'moveFile'}
        title="移動檔案"
        subtitle={dialog?.file?.name}
        fields={[
          { name: 'folderId', label: '移動到', type: 'select', options: folderOptions, value: dialog?.file?.folder_id || '' },
        ]}
        confirmLabel="移動"
        onSubmit={submitMoveFile}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.type === 'deleteFile'}
        title="刪除檔案？"
        description={`「${dialog?.file?.name || ''}」會從儲存空間永久刪除，無法復原。`}
        confirmLabel="刪除"
        onConfirm={() => confirmDeleteFile(dialog.file)}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.type === 'deleteFolder'}
        title="刪除資料夾？"
        description={(() => {
          if (!dialog?.folder) return '';
          const info = subtreeSummary(dialog.folder.id);
          if (!info.fileCount && info.folderCount <= 1) return `「${dialog.folder.name}」是空資料夾，刪除後無法復原。`;
          return `「${dialog.folder.name}」內還有 ${info.folderCount - 1} 個子資料夾、${info.fileCount} 個檔案（${formatBytes(info.totalSize)}），刪除後會一併永久移除，無法復原。`;
        })()}
        confirmLabel="刪除"
        onConfirm={() => confirmDeleteFolder(dialog.folder)}
        onCancel={() => setDialog(null)}
      />

      {dialog?.type === 'preview' && (
        <FilePreview file={dialog.file} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}