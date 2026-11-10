-- MarkNote 資料庫結構（PostgreSQL / Neon）
-- 全部使用 IF NOT EXISTS，可重複執行（idempotent）

CREATE TABLE IF NOT EXISTS categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  emoji      text NOT NULL DEFAULT '',
  color      text NOT NULL DEFAULT '',
  sort_order double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_key ON categories (lower(name));

CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_name_lower_key ON tags (lower(name));

CREATE TABLE IF NOT EXISTS notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',
  category_id uuid REFERENCES categories (id) ON DELETE SET NULL,
  pinned      boolean NOT NULL DEFAULT false,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_category_id_idx ON notes (category_id);
CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes (archived);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id uuid NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS note_tags_tag_id_idx ON note_tags (tag_id);

-- ── 檔案庫：資料夾（樹狀，parent_id 為 NULL 代表根目錄） ─────────────────
CREATE TABLE IF NOT EXISTS folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  parent_id  uuid REFERENCES folders (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(name)) > 0)
);

-- 同一層資料夾名稱不分大小寫唯一（根目錄以全零 UUID 代替 NULL）
CREATE UNIQUE INDEX IF NOT EXISTS folders_sibling_name_key
  ON folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ── 檔案庫：檔案詮釋資料（實際內容存於 Neon Object Storage） ────────────────
CREATE TABLE IF NOT EXISTS files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  mime       text NOT NULL DEFAULT 'application/octet-stream',
  size       bigint NOT NULL DEFAULT 0,
  object_key text NOT NULL UNIQUE,
  folder_id  uuid REFERENCES folders (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_folder_id_idx ON files (folder_id);
CREATE INDEX IF NOT EXISTS files_created_at_idx ON files (created_at DESC);
