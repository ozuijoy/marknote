import { query, queryOne, transaction } from './db';
import { excerptOf } from './media';

/**
 * 資料存取層：所有 SQL 都在這裡，API route 只做驗證與序列化。
 * 注意：Neon HTTP driver 回傳的 int8 是字串，因此計數一律 CAST 成 ::int。
 */

const NOTE_SELECT_LIST = `
  SELECT n.id,
         n.title,
         n.category_id,
         n.pinned,
         n.archived,
         n.created_at,
         n.updated_at,
         left(n.content, 500) AS content_head,
         length(n.content)::int AS content_length,
         (n.content ~ '!\\[[^]]*\\]\\(\\s*<?(https?:|/|data:image)'
           OR n.content ~* '<(img|video|audio|iframe|source)\\b') AS has_media,
         COALESCE(
           json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
             FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
  FROM notes n
  LEFT JOIN note_tags nt ON nt.note_id = n.id
  LEFT JOIN tags t ON t.id = nt.tag_id
`;

const NOTE_SELECT_FULL = `
  SELECT n.id, n.title, n.content, n.category_id, n.pinned, n.archived, n.created_at, n.updated_at,
         COALESCE(
           json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
             FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
  FROM notes n
  LEFT JOIN note_tags nt ON nt.note_id = n.id
  LEFT JOIN tags t ON t.id = nt.tag_id
`;

/** 分類清單（含未封存筆記數） */
export function listCategories() {
  return query(`
    SELECT c.id, c.name, c.emoji, c.color, c.sort_order,
           (SELECT COUNT(*)::int FROM notes n WHERE n.category_id = c.id AND n.archived = false) AS note_count
    FROM categories c
    ORDER BY c.sort_order ASC, c.name ASC
  `);
}

/** 標籤清單（含未封存筆記數） */
export function listTags() {
  return query(`
    SELECT t.id, t.name, t.color,
           (SELECT COUNT(*)::int FROM note_tags nt
              JOIN notes n ON n.id = nt.note_id
             WHERE nt.tag_id = t.id AND n.archived = false) AS note_count
    FROM tags t
    ORDER BY lower(t.name) ASC
  `);
}

/** 筆記清單（不含完整內文） */
export async function listNotes({ archived = false, categoryId = null, tagId = null, limit = 500 } = {}) {
  const clauses = ['n.archived = $1'];
  const params = [archived];
  if (categoryId) {
    params.push(categoryId);
    clauses.push(`n.category_id = $${params.length}::uuid`);
  }
  if (tagId) {
    params.push(tagId);
    clauses.push(`EXISTS (SELECT 1 FROM note_tags nt2 WHERE nt2.note_id = n.id AND nt2.tag_id = $${params.length}::uuid)`);
  }
  params.push(Math.min(Number(limit) || 500, 1000));
  const rows = await query(
    `${NOTE_SELECT_LIST}
     WHERE ${clauses.join(' AND ')}
     GROUP BY n.id
     ORDER BY n.pinned DESC, n.updated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(decorateNoteListItem);
}

/** 全文搜尋（標題＋內文＋標籤名） */
export async function searchNotes(keyword, { archived = false, limit = 100 } = {}) {
  const like = `%${escapeLike(keyword)}%`;
  const rows = await query(
    `${NOTE_SELECT_LIST}
     WHERE n.archived = $1
       AND (n.title ILIKE $2 OR n.content ILIKE $2 OR EXISTS (
             SELECT 1 FROM note_tags nt3 JOIN tags t3 ON t3.id = nt3.tag_id
              WHERE nt3.note_id = n.id AND t3.name ILIKE $2))
     GROUP BY n.id
     ORDER BY n.pinned DESC, n.updated_at DESC
     LIMIT $3`,
    [archived, like, Math.min(Number(limit) || 100, 500)],
  );
  return rows.map((row) => decorateNoteListItem(row, keyword));
}

function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 補上列表顯示用的摘要與搜尋命中片段 */
function decorateNoteListItem(row, keyword = '') {
  const head = row.content_head || '';
  return {
    ...row,
    tags: parseTags(row.tags),
    excerpt: excerptOf(head, 140),
    snippet: keyword ? buildSnippet(row.content_head || '', keyword) : '',
    content_head: undefined,
  };
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildSnippet(content, keyword, radius = 60) {
  const plain = excerptOf(content, 100000);
  const idx = plain.toLowerCase().indexOf(String(keyword).toLowerCase());
  if (idx < 0) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(plain.length, idx + keyword.length + radius);
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

/** 單一筆記（含完整內文） */
export async function getNote(id) {
  const row = await queryOne(`${NOTE_SELECT_FULL} WHERE n.id = $1::uuid GROUP BY n.id`, [id]);
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags) };
}

/** 建立筆記；tagNames 不存在的標籤會自動建立 */
export async function createNote({ title = '', content = '', categoryId = null, tagNames = [], pinned = false } = {}) {
  const id = globalThis.crypto?.randomUUID?.() ?? randomUuidFallback();
  const tagList = normalizeTagNames(tagNames);
  const statements = [
    {
      text: `INSERT INTO notes (id, title, content, category_id, pinned)
             VALUES ($1::uuid, $2, $3, NULLIF($4, '')::uuid, $5)
             RETURNING id`,
      params: [id, title, content, categoryId || '', pinned === true],
    },
  ];
  if (tagList.length) {
    statements.push({
      text: `INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (lower(name)) DO NOTHING`,
      params: [tagList],
    });
    statements.push({
      text: `INSERT INTO note_tags (note_id, tag_id)
             SELECT $1::uuid, id FROM tags WHERE lower(name) = ANY($2::text[])
             ON CONFLICT DO NOTHING`,
      params: [id, tagList.map((t) => t.toLowerCase())],
    });
  }
  await transaction(statements);
  return getNote(id);
}

/** 更新筆記（部分欄位） */
export async function updateNote(id, patch = {}) {
  const sets = [];
  const params = [id];
  const push = (column, value, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  if (patch.title !== undefined) push('title', String(patch.title).slice(0, 500));
  if (patch.content !== undefined) push('content', String(patch.content));
  if (patch.pinned !== undefined) push('pinned', patch.pinned === true);
  if (patch.archived !== undefined) push('archived', patch.archived === true);
  if (patch.categoryId !== undefined) {
    params.push(patch.categoryId || '');
    sets.push(`category_id = NULLIF($${params.length}, '')::uuid`);
  }

  const statements = [];
  if (sets.length) {
    statements.push({
      text: `UPDATE notes SET ${sets.join(', ')}, updated_at = now() WHERE id = $1::uuid RETURNING id`,
      params,
    });
  } else {
    statements.push({ text: `UPDATE notes SET updated_at = now() WHERE id = $1::uuid RETURNING id`, params: [id] });
  }

  const syncTags = patch.tagNames !== undefined;
  const tagList = syncTags ? normalizeTagNames(patch.tagNames) : [];
  if (syncTags) {
    statements.push({ text: `DELETE FROM note_tags WHERE note_id = $1::uuid`, params: [id] });
    if (tagList.length) {
      statements.push({
        text: `INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (lower(name)) DO NOTHING`,
        params: [tagList],
      });
      statements.push({
        text: `INSERT INTO note_tags (note_id, tag_id)
               SELECT $1::uuid, id FROM tags WHERE lower(name) = ANY($2::text[])
               ON CONFLICT DO NOTHING`,
        params: [id, tagList.map((t) => t.toLowerCase())],
      });
    }
  }

  await transaction(statements);
  return getNote(id);
}

/** 刪除筆記（連同標籤關聯，FK cascade） */
export async function deleteNote(id) {
  const row = await queryOne(`DELETE FROM notes WHERE id = $1::uuid RETURNING id`, [id]);
  return Boolean(row);
}

/** 複製筆記 */
export async function duplicateNote(id) {
  const source = await getNote(id);
  if (!source) return null;
  return createNote({
    title: `${source.title || '未命名'} (副本)`,
    content: source.content,
    categoryId: source.category_id,
    tagNames: source.tags.map((t) => t.name),
    pinned: false,
  });
}

function normalizeTagNames(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Map();
  for (const raw of input) {
    const name = String(raw ?? '').trim().replace(/^#/, '').slice(0, 40);
    if (!name) continue;
    seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].slice(0, 30);
}

function randomUuidFallback() {
  // crypto.randomUUID 在 Node 19+ / 現代瀏覽器皆可用；此處僅為保險
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── 分類 ────────────────────────────────────────────────────────────────

export async function createCategory({ name, emoji = '', color = '' }) {
  const next = await queryOne(`SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM categories`);
  const row = await queryOne(
    `INSERT INTO categories (name, emoji, color, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, emoji, color, sort_order`,
    [String(name).trim().slice(0, 60), String(emoji || '').slice(0, 16), String(color || '').slice(0, 32), Number(next?.next) || 1],
  );
  return row ? { ...row, note_count: 0 } : null;
}

export function updateCategory(id, { name, emoji, color }) {
  const sets = [];
  const params = [id];
  if (name !== undefined) {
    params.push(String(name).trim().slice(0, 60));
    sets.push(`name = $${params.length}`);
  }
  if (emoji !== undefined) {
    params.push(String(emoji).slice(0, 16));
    sets.push(`emoji = $${params.length}`);
  }
  if (color !== undefined) {
    params.push(String(color).slice(0, 32));
    sets.push(`color = $${params.length}`);
  }
  if (!sets.length) return getCategoryId(id);
  return queryOne(
    `UPDATE categories SET ${sets.join(', ')} WHERE id = $1::uuid
     RETURNING id, name, emoji, color, sort_order`,
    params,
  );
}

function getCategoryId(id) {
  return queryOne(`SELECT id, name, emoji, color, sort_order FROM categories WHERE id = $1::uuid`, [id]);
}

export async function deleteCategory(id) {
  const row = await queryOne(`DELETE FROM categories WHERE id = $1::uuid RETURNING id`, [id]);
  return Boolean(row);
}

/** 上移／下移分類（與相鄰項目交換 sort_order） */
export async function moveCategory(id, direction) {
  const current = await queryOne(`SELECT id, sort_order FROM categories WHERE id = $1::uuid`, [id]);
  if (!current) return false;
  const op = direction === 'up' ? '<' : '>';
  const order = direction === 'up' ? 'DESC' : 'ASC';
  const neighbor = await queryOne(
    `SELECT id, sort_order FROM categories WHERE sort_order ${op} $1 ORDER BY sort_order ${order} LIMIT 1`,
    [Number(current.sort_order) || 0],
  );
  if (!neighbor) return false;
  const a = Number(current.sort_order) || 0;
  const b = Number(neighbor.sort_order) || 0;
  if (a === b) {
    // sort_order 相同時，用固定間距重整後再交換
    await rebuildCategoryOrder();
    return moveCategory(id, direction);
  }
  await transaction([
    { text: `UPDATE categories SET sort_order = $2 WHERE id = $1::uuid`, params: [id, b] },
    { text: `UPDATE categories SET sort_order = $2 WHERE id = $1::uuid`, params: [neighbor.id, a] },
  ]);
  return true;
}

async function rebuildCategoryOrder() {
  const rows = await query(`SELECT id FROM categories ORDER BY sort_order ASC, created_at ASC, name ASC`);
  await transaction(
    rows.map((row, index) => ({
      text: `UPDATE categories SET sort_order = $2 WHERE id = $1::uuid`,
      params: [row.id, index + 1],
    })),
  );
}

// ── 標籤 ────────────────────────────────────────────────────────────────

export async function createTag({ name, color = '' }) {
  const clean = String(name ?? '').trim().replace(/^#/, '').slice(0, 40);
  if (!clean) return null;
  const row = await queryOne(
    `INSERT INTO tags (name, color) VALUES ($1, $2)
     ON CONFLICT (lower(name)) DO UPDATE SET color = EXCLUDED.color
     RETURNING id, name, color`,
    [clean, String(color || '').slice(0, 32)],
  );
  return row;
}

export function updateTag(id, { name, color }) {
  const sets = [];
  const params = [id];
  if (name !== undefined) {
    params.push(String(name).trim().replace(/^#/, '').slice(0, 40));
    sets.push(`name = $${params.length}`);
  }
  if (color !== undefined) {
    params.push(String(color).slice(0, 32));
    sets.push(`color = $${params.length}`);
  }
  if (!sets.length) return queryOne(`SELECT id, name, color FROM tags WHERE id = $1::uuid`, [id]);
  return queryOne(`UPDATE tags SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING id, name, color`, params);
}

export async function deleteTag(id) {
  const row = await queryOne(`DELETE FROM tags WHERE id = $1::uuid RETURNING id`, [id]);
  return Boolean(row);
}
