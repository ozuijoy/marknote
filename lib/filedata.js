import { query, queryOne } from './db';

/**
 * 檔案庫資料存取層（資料夾與檔案詮釋資料）。
 * 物件內容本身存放於 Neon Object Storage，這裡只存指標與中介資料。
 */

const FILE_COLUMNS = `id, name, mime, size, object_key, folder_id, created_at, updated_at`;

/** 所有資料夾（含直接子項數量、檔案數與容量），一次回傳供前端組樹 */
export function listFolders() {
  return query(`
    SELECT f.id, f.name, f.parent_id, f.created_at,
           (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id) AS file_count,
           (SELECT COALESCE(sum(x.size), 0)::text FROM files x WHERE x.folder_id = f.id) AS total_size,
           (SELECT count(*)::int FROM folders c WHERE c.parent_id = f.id) AS child_count
      FROM folders f
     ORDER BY lower(f.name) ASC
  `);
}

export function getFolder(id) {
  return queryOne('SELECT id, name, parent_id, created_at FROM folders WHERE id = $1', [id]);
}

export async function createFolder({ name, parentId = null }) {
  return queryOne(
    `INSERT INTO folders (name, parent_id) VALUES ($1, $2)
     RETURNING id, name, parent_id, created_at`,
    [name, parentId],
  );
}

export async function renameFolder(id, name) {
  return queryOne(
    `UPDATE folders SET name = $2 WHERE id = $1
     RETURNING id, name, parent_id, created_at`,
    [id, name],
  );
}

export async function moveFolder(id, parentId) {
  return queryOne(
    `UPDATE folders SET parent_id = $2 WHERE id = $1
     RETURNING id, name, parent_id, created_at`,
    [id, parentId],
  );
}

/** 子樹中的所有資料夾 id（含自己） */
export async function folderSubtreeIds(id) {
  const rows = await query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
     )
     SELECT id FROM sub`,
    [id],
  );
  return rows.map((r) => r.id);
}

/** targetId 是否位於 rootId 的子樹中（含自己），用於防止把資料夾搬進自己的子孫 */
export async function isInSubtree(rootId, targetId) {
  const row = await queryOne(
    `WITH RECURSIVE sub AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
     )
     SELECT EXISTS (SELECT 1 FROM sub WHERE id = $2) AS hit`,
    [rootId, targetId],
  );
  return Boolean(row?.hit);
}

/** 子樹中的檔案與資料夾統計（刪除前確認用） */
export async function subtreeStats(id) {
  const row = await queryOne(
    `WITH RECURSIVE sub AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
     )
     SELECT (SELECT count(*)::int FROM files WHERE folder_id IN (SELECT id FROM sub)) AS file_count,
            (SELECT COALESCE(sum(size), 0)::text FROM files WHERE folder_id IN (SELECT id FROM sub)) AS total_size,
            (SELECT count(*)::int FROM sub) - 1 AS folder_count`,
    [id],
  );
  return {
    fileCount: Number(row?.file_count || 0),
    totalSize: Number(row?.total_size || 0),
    folderCount: Number(row?.folder_count || 0),
  };
}

/** 子樹中所有物件的 key（實際刪除 bucket 物件用） */
export async function subtreeObjectKeys(id) {
  const rows = await query(
    `WITH RECURSIVE sub AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
     )
     SELECT object_key FROM files WHERE folder_id IN (SELECT id FROM sub)`,
    [id],
  );
  return rows.map((r) => r.object_key);
}

/** 刪除資料夾；子資料夾與檔案列由 ON DELETE CASCADE 一併移除 */
export async function deleteFolderRow(id) {
  return queryOne('DELETE FROM folders WHERE id = $1 RETURNING id', [id]);
}

/** 列出某資料夾的檔案（folderId = null 代表根目錄） */
export function listFiles(folderId = null) {
  return query(
    `SELECT ${FILE_COLUMNS} FROM files
      WHERE folder_id IS NOT DISTINCT FROM $1::uuid
      ORDER BY lower(name) ASC, created_at ASC`,
    [folderId],
  );
}

export function getFile(id) {
  return queryOne(`SELECT ${FILE_COLUMNS} FROM files WHERE id = $1`, [id]);
}

export function getFileByKey(key) {
  return queryOne(`SELECT ${FILE_COLUMNS} FROM files WHERE object_key = $1`, [key]);
}

export async function createFile({ name, mime, size, objectKey, folderId = null }) {
  return queryOne(
    `INSERT INTO files (name, mime, size, object_key, folder_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${FILE_COLUMNS}`,
    [name, mime, size, objectKey, folderId],
  );
}

export async function renameFile(id, name) {
  return queryOne(
    `UPDATE files SET name = $2, updated_at = now() WHERE id = $1 RETURNING ${FILE_COLUMNS}`,
    [id, name],
  );
}

export async function moveFile(id, folderId) {
  return queryOne(
    `UPDATE files SET folder_id = $2, updated_at = now() WHERE id = $1 RETURNING ${FILE_COLUMNS}`,
    [id, folderId],
  );
}

export async function deleteFileRow(id) {
  return queryOne('DELETE FROM files WHERE id = $1 RETURNING id, object_key', [id]);
}

/** 根目錄與整體用量 */
export async function storageStats() {
  const row = await queryOne(
    `SELECT (SELECT count(*)::int FROM files) AS file_count,
            (SELECT COALESCE(sum(size), 0)::text FROM files) AS total_size,
            (SELECT count(*)::int FROM folders) AS folder_count,
            (SELECT count(*)::int FROM files WHERE folder_id IS NULL) AS root_file_count`,
  );
  return {
    fileCount: Number(row?.file_count || 0),
    totalSize: Number(row?.total_size || 0),
    folderCount: Number(row?.folder_count || 0),
    rootFileCount: Number(row?.root_file_count || 0),
  };
}

/** 麵包屑（由根到目前資料夾） */
export async function folderPath(id) {
  if (!id) return [];
  const rows = await query(
    `WITH RECURSIVE up AS (
       SELECT id, name, parent_id, 0 AS depth FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id, f.name, f.parent_id, up.depth + 1 FROM folders f JOIN up ON f.id = up.parent_id
     )
     SELECT id, name FROM up ORDER BY depth DESC`,
    [id],
  );
  return rows;
}

/** 對外序列化：不暴露 object_key，只給可存取的 URL */
export function fileDto(row) {
  if (!row) return null;
  const id = row.id;
  return {
    id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size || 0),
    folder_id: row.folder_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rawUrl: `/api/files/${id}/raw`,
    downloadUrl: `/api/files/${id}/raw?download=1`,
  };
}

export function folderDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id || null,
    created_at: row.created_at,
    file_count: Number(row.file_count || 0),
    total_size: Number(row.total_size || 0),
    child_count: Number(row.child_count || 0),
  };
}