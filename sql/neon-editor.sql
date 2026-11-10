-- ============================================================================
-- MarkNote — Neon SQL Editor 一鍵初始化腳本
--
-- 使用方式：Neon Console → 左側「SQL Editor」→ 貼上整份內容 → Run
--
-- 特性：
--   • 可重複執行（全部 IF NOT EXISTS），不會刪除或覆寫既有資料
--   • 整份包在單一交易內，中途失敗會全部回滾
--   • 結尾附帶驗證查詢，執行完可直接看到 4 張表
--
-- 注意：本腳本只「建立缺少的物件」，不會為既有資料表補上新欄位。
--       若日後結構有變更，請在下方自行加上 ALTER TABLE ... ADD COLUMN IF NOT EXISTS。
-- ============================================================================

begin;

-- ── 分類 ────────────────────────────────────────────────────────────────────
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  emoji      text not null default '',
  color      text not null default '',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

-- 分類名稱不分大小寫唯一
create unique index if not exists categories_name_lower_key
  on categories (lower(name));

-- ── 標籤 ────────────────────────────────────────────────────────────────────
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '',
  created_at timestamptz not null default now()
);

-- 標籤名稱不分大小寫唯一
create unique index if not exists tags_name_lower_key
  on tags (lower(name));

-- ── 筆記 ────────────────────────────────────────────────────────────────────
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  content     text not null default '',
  category_id uuid references categories (id) on delete set null,
  pinned      boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_updated_at_idx on notes (updated_at desc);
create index if not exists notes_category_id_idx on notes (category_id);
create index if not exists notes_archived_idx on notes (archived);

-- ── 筆記 ↔ 標籤（多對多） ───────────────────────────────────────────────────
create table if not exists note_tags (
  note_id uuid not null references notes (id) on delete cascade,
  tag_id  uuid not null references tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

create index if not exists note_tags_tag_id_idx on note_tags (tag_id);

-- ── 檔案庫：資料夾（樹狀，parent_id 為 NULL 代表根目錄） ─────────────────
create table if not exists folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (length(btrim(name)) > 0)
);

-- 同一層資料夾名稱不分大小寫唯一（根目錄以全零 UUID 代替 NULL）
create unique index if not exists folders_sibling_name_key
  on folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- ── 檔案庫：檔案詮釋資料（實際內容存於 Neon Object Storage） ────────────────
create table if not exists files (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  mime       text not null default 'application/octet-stream',
  size       bigint not null default 0,
  object_key text not null unique,
  folder_id  uuid references folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists files_folder_id_idx on files (folder_id);
create index if not exists files_created_at_idx on files (created_at desc);

commit;

-- ── 驗證：應列出 categories、files、folders、note_tags、notes、tags 六張表 ──
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('categories', 'files', 'folders', 'notes', 'tags', 'note_tags')
 order by table_name;