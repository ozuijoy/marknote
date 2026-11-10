# MarkNote

類 Notion 的 Markdown 筆記 Web App：Next.js 15（App Router）+ Neon Postgres（HTTP driver）+ Netlify 部署。
單一密碼進站、淺色／深色主題、三欄桌面版面（分類／標籤 → 筆記列表 → 編輯／閱讀），
閱讀模式可內嵌外部圖片、音訊、影片與 YouTube／Vimeo／Bilibili；
另附檔案庫（Neon Object Storage，S3 相容），可一次上傳多檔並在筆記中插入。

## 功能

- **分類與標籤**：新增／改名／刪除／上下移動排序（拖曳亦可）；側欄兩區可收合。
- **筆記**：建立、編輯、自動儲存（Ctrl/Cmd+S 立即儲存）、釘選、封存／還原、建立副本、刪除。
- **Markdown**：GFM（表格、待辦清單、刪除線）、程式碼高亮、工具列插入語法。
- **媒體**：`![](url)` 圖片、`<audio>`、`<video>` 直接播放；YouTube／Vimeo／Bilibili 連結自動轉內嵌播放器（網域白名單控管）。
- **檔案庫**：多檔上傳（含拖放）、資料夾樹（新增／改名／搬移／刪除）、檔案預覽（圖片／音訊／影片／文字）、
  移動與刪除（刪除前確認；資料夾非空需明確同意）、側欄統計用量。物件儲存走 Neon Object Storage。
- **筆記插入檔案**：編輯器工具列可上傳單一圖片／音訊／影片並插入對應 Markdown／HTML，閱讀模式直接顯示播放。
- **安全**：Markdown 以 `rehype-raw` + `rehype-sanitize` 過濾後才渲染；API 一律回 JSON；所有 SQL 皆參數化；登入有簡易限流。
- **版面**：桌面三欄（側欄可收合）；手機登入後先看到筆記列表，點筆記才進內文，側欄改為抽屜。

## 環境變數

複製 `.env.example` 為 `.env.local`（本機）或直接在 Netlify 設定：

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Neon pooled 連線字串（`...-pooler...`，`sslmode=require`） |
| `APP_PASSWORD` | ✅ | 進站密碼 |
| `AUTH_SECRET` | ✅ | session JWT 簽章金鑰，≥ 32 字元（`openssl rand -base64 48`） |
| `NEXT_PUBLIC_APP_NAME` | – | 顯示名稱，預設 `MarkNote` |
| `SESSION_MAX_AGE_DAYS` | – | session 天數，預設 7 |
| `COOKIE_SECURE` | – | `auto`（預設）／`true`／`false` |
| `EMBED_ALLOWLIST` | – | 允許 iframe 內嵌的網域，逗號分隔 |
| `NEON_FETCH_ENDPOINT` | – | 僅本機測試用，導向 Neon 相容 shim |
| `AWS_ENDPOINT_URL_S3` | 檔案庫 | Neon Object Storage 端點（Console → Storage 取得） |
| `AWS_ACCESS_KEY_ID` | 檔案庫 | 物件儲存存取金鑰 |
| `AWS_SECRET_ACCESS_KEY` | 檔案庫 | 物件儲存私鑰 |
| `AWS_REGION` | 檔案庫 | 例如 `ap-southeast-1`，預設 `us-east-1` |
| `STORAGE_BUCKET` | 檔案庫 | bucket 名稱，例如 `marknote-files` |
| `STORAGE_MAX_UPLOAD_MB` | – | 單檔上限，預設 200（上限 5120） |
| `APP_ORIGIN` | – | `storage:init` 設定 CORS 用，逗號分隔多來源 |

> 檔案庫的變數全部留空時，筆記功能照常運作，檔案庫頁面會顯示設定說明。

## 本機開發

```bash
npm install
npm run db:init     # 依 DATABASE_URL 建立資料表（可重複執行）
npm run dev         # http://localhost:3000
```

`npm run db:reset` 會清空資料後重建（僅供本機）。

## 測試

- 單元測試（媒體解析、格式化、密碼比對、檔名與 MIME 處理）：`npm test`（30 項）
- API 整合測試（筆記／分類／標籤）：需要先啟動伺服器，再 `BASE_URL=... TEST_PASSWORD=... npm run test:api`（25 項）
- 檔案庫 API 測試：`BASE_URL=... TEST_PASSWORD=... npm run test:files`（13 項，需已設定物件儲存）

不想連 Neon 也能跑完整流程（本地 PostgreSQL + Neon HTTP 相容 shim + build + start）：

```bash
bash dev/run-local.sh build   # 建置並啟動（PORT 預設 3100）
bash dev/run-local.sh test    # 單元 + API 整合測試
bash dev/run-local.sh stop
```

## 部署到 Netlify

1. 建立 Neon 專案，取得 pooled 連線字串，執行 `DATABASE_URL=... npm run db:init` 建表；
   或直接把 `sql/neon-editor.sql` 整份貼進 Neon Console 的 SQL Editor 執行（單一交易、可重複執行）。
2. Netlify 新增站台並連結此 repo；`netlify.toml` 已設定 build command `npm run build`、publish `.next`（Next.js Runtime 由 Netlify 自動套用）。
3. 在 Site settings → Environment variables 設定 `DATABASE_URL`、`APP_PASSWORD`、`AUTH_SECRET`（可選 `NEXT_PUBLIC_APP_NAME` 等）。
4. 啟用檔案庫：Neon Console → Storage 建立 bucket，取得 S3 端點與金鑰，在 Netlify 加上
   `AWS_ENDPOINT_URL_S3`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_REGION`、`STORAGE_BUCKET`。
5. 本機執行一次儲存初始化（建立 bucket 並設定 CORS）：

   ```bash
   APP_ORIGIN=https://your-site.netlify.app npm run storage:init
   ```

6. 部署後開啟網站 → 輸入 `APP_PASSWORD` 登入。

> 注意：`DATABASE_URL` 請用 **pooled** 連線；`AUTH_SECRET` 一旦更換，既有 session 會全部失效。

## 結構

```
app/               頁面與 API 路由（api/health、auth、session、bootstrap、notes、categories、tags、
                   folders、files、storage）
components/        Sidebar、NoteList、NoteEditor、MarkdownView、Modal、TagPicker、Workspace、
                   FileManager、FolderTree、FilePreview…
lib/               db（Neon HTTP）、data（SQL 存取）、media（媒體解析）、store（前端狀態）、theme、
                   storage（S3 用戶端）、file-utils（檔名／MIME）、upload、filedata…
sql/schema.sql     資料表結構（idempotent，供 scripts/init-db.mjs 使用）
sql/neon-editor.sql 同一份結構的「單檔交易」版本，可直接貼進 Neon SQL Editor
scripts/           init-db（建表）、storage-init（bucket + CORS）
dev/               本機測試環境：run-local.sh + Neon HTTP → PostgreSQL shim
tests/             單元測試與 API 整合測試
```