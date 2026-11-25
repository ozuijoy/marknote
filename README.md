# MarkNote

類 Notion 的 Markdown 筆記 Web App：Next.js 15（App Router）+ Neon Postgres（HTTP driver）+ Netlify／Vercel 部署。
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
- **AI 整理**（選用）：串接任何 OpenAI 相容模型，在編輯器內潤飾、修正錯字、精簡、擴寫、整理結構、摘要、翻譯、自訂指令，
  並可建議標題／分類／標籤。有選取文字時只處理選取範圍；結果先預覽（可看差異、可手動修改），按下才套用，可一鍵復原。
- **MCP 端點**（選用）：`/api/mcp` 讓 Claude Desktop、Cursor、Codex 等 AI agent 直接搜尋、讀取、建立與更新筆記。
- **安全**：Markdown 以 `rehype-raw` + `rehype-sanitize` 過濾後才渲染；API 一律回 JSON；所有 SQL 皆參數化；登入有簡易限流。
- **版面**：桌面三欄（側欄可收合）；手機登入後先看到筆記列表，點筆記才進內文，側欄改為抽屜。

## 環境變數

複製 `.env.example` 為 `.env.local`（本機）或直接在 Netlify／Vercel 設定：

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
| `S3_ENDPOINT` | 檔案庫 | Neon Object Storage 端點（Console → Storage 取得） |
| `S3_ACCESS_KEY_ID` | 檔案庫 | 物件儲存存取金鑰 |
| `S3_SECRET_ACCESS_KEY` | 檔案庫 | 物件儲存私鑰 |
| `S3_REGION` | 檔案庫 | 例如 `ap-southeast-1`，預設 `us-east-1` |
| `STORAGE_BUCKET` | 檔案庫 | bucket 名稱，例如 `marknote-files` |
| `STORAGE_MAX_UPLOAD_MB` | – | 單檔上限，預設 200（上限 5120） |
| `STORAGE_AUTO_CORS` | – | 預設開啟：上傳時自動把目前網站來源加進 bucket CORS；設 `0` 關閉 |
| `DB_AUTO_INIT` | – | 預設開啟：`npm run build` 前自動建立缺少的資料表；設 `0` 關閉 |
| `APP_ORIGIN` | – | 只給 `storage:init` 手動設定 CORS 用，逗號分隔多來源 |
| `MCP_TOKEN` | MCP | agent 存取 `/api/mcp` 的權杖（`openssl rand -base64 32`）；留空則停用 MCP |
| `MCP_READONLY` | – | 設 `1` 時 MCP 只開放讀取工具 |
| `AI_BASE_URL` | AI | OpenAI 相容端點，例如 `https://api.openai.com/v1`、`http://localhost:11434/v1` |
| `AI_API_KEY` | AI | 模型服務金鑰（只在伺服器使用，不會傳到瀏覽器）；本機模型可留空 |
| `AI_MODEL` | AI | 模型名稱，例如 `gpt-4o-mini`、`deepseek-chat`、`qwen2.5:14b` |
| `AI_TEMPERATURE` | – | 預設 0.3 |
| `AI_MAX_TOKENS` | – | 輸出上限，預設交給模型 |
| `AI_MAX_INPUT_CHARS` | – | 單次送出字元上限，預設 60000 |
| `AI_TIMEOUT_MS` | – | 呼叫逾時，預設 120000 |

> 檔案庫的變數全部留空時，筆記功能照常運作，檔案庫頁面會顯示設定說明。

## AI 整理

設定 `AI_BASE_URL`、`AI_MODEL`（以及需要時的 `AI_API_KEY`）後，編輯器工具列與右上角會出現 ✦ AI 按鈕（快捷鍵 Ctrl/⌘ + J）。

- 有選取文字：只處理選取範圍，可「取代選取」或「插入於下方」；沒選取：處理整篇筆記。
- 動作：潤飾、修正錯字、精簡、擴寫、整理結構、摘要、翻譯、自訂指令；每個動作都可加額外要求。
- 「標題／分類／標籤」：從現有分類與標籤挑選建議，勾選後套用（標籤只會新增，不會移除）。
- 結果逐字串流顯示，可切換「差異」檢視、可直接修改再套用；套用後上方會出現「復原」。
- 推理模型（DeepSeek-R1、QwQ…）輸出的 `<think>` 內容會自動略過。

相容服務：OpenAI、Azure OpenAI（相容端點）、DeepSeek、通義千問 DashScope 相容模式、OpenRouter、Groq、
Together、SiliconFlow、Ollama、LM Studio、vLLM 等。部署在 Netlify／Vercel 時，本機的 Ollama 需要對外可連線的網址。

## MCP（給 AI agent 使用）

設定 `MCP_TOKEN` 後，`https://你的網域/api/mcp` 即為 MCP Streamable HTTP 端點（無狀態、JSON 回應）。

同時支援新舊兩代協定，用戶端不需調整：

- **2026-07-28（新版）**：不需 `initialize` 握手，每個請求在 `params._meta` 帶協定版本，並帶 `MCP-Protocol-Version`、`Mcp-Method`（`tools/call`／`resources/read` 另需 `Mcp-Name`）標頭；支援 `server/discover`。標頭與 body 不一致回 `400`（`-32020`），不支援的版本回 `400`（`-32022`，附支援版本清單）。
- **2025-11-25、2025-06-18、2025-03-26、2024-11-05（舊版）**：照舊先 `initialize` 再呼叫。

| 工具 | 說明 |
| --- | --- |
| `search_notes` | 關鍵字搜尋（標題、內文、標籤） |
| `list_notes` | 列出筆記，可依分類／標籤篩選 |
| `get_note` | 讀取完整 Markdown |
| `list_categories`、`list_tags` | 列出分類與標籤 |
| `create_note` | 建立筆記（標籤自動建立） |
| `update_note` | 更新標題／內文／分類／標籤／釘選 |
| `append_to_note` | 在筆記最後附加內容 |
| `archive_note` | 封存或還原 |
| `delete_note` | 永久刪除 |
| `create_category` | 建立分類 |

另提供資源 `marknote://note/{id}`（Markdown）。設定 `MCP_READONLY=1` 時只保留讀取類工具。

**Claude Code**

```bash
claude mcp add --transport http marknote https://你的網域/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

**Cursor**（`~/.cursor/mcp.json`）

```json
{
  "mcpServers": {
    "marknote": {
      "url": "https://你的網域/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

**Claude Desktop**（`claude_desktop_config.json`，透過 `mcp-remote` 轉接）

```json
{
  "mcpServers": {
    "marknote": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://你的網域/api/mcp", "--header", "Authorization: Bearer ${MCP_TOKEN}"],
      "env": { "MCP_TOKEN": "<MCP_TOKEN>" }
    }
  }
}
```

> `MCP_TOKEN` 等同完整讀寫權限，請當作密碼保管；只想讓 agent 查資料時加上 `MCP_READONLY=1`。

## 本機開發

```bash
npm install
npm run db:init     # 依 DATABASE_URL 建立資料表（可重複執行）
npm run dev         # http://localhost:3000
```

`npm run db:reset` 會清空資料後重建（僅供本機）。

## 測試

- 單元測試（媒體解析、格式化、密碼比對、檔名與 MIME、MCP 協定、AI 串流解析、差異比對）：`npm test`
- MCP 端點整合測試：伺服器以 `MCP_TOKEN` 啟動後，`BASE_URL=... MCP_TOKEN=... npm run test:mcp`
- API 整合測試（筆記／分類／標籤）：需要先啟動伺服器，再 `BASE_URL=... TEST_PASSWORD=... npm run test:api`（25 項）
- 檔案庫 API 測試：`BASE_URL=... TEST_PASSWORD=... npm run test:files`（13 項，需已設定物件儲存）

不想連 Neon 也能跑完整流程（本地 PostgreSQL + Neon HTTP 相容 shim + build + start）：

```bash
bash dev/run-local.sh build   # 建置並啟動（PORT 預設 3100）
bash dev/run-local.sh test    # 單元 + API 整合測試
bash dev/run-local.sh stop
```

## 部署到 Netlify

1. 建立 Neon 專案，取得 pooled 連線字串。部署建置時會自動建立缺少的資料表（可重複執行，不動既有資料）；
   想手動建表也可執行 `DATABASE_URL=... npm run db:init`，或直接把 `sql/neon-editor.sql` 整份貼進 Neon Console 的 SQL Editor 執行（單一交易、可重複執行）。
2. Netlify 新增站台並連結此 repo；`netlify.toml` 已設定 build command `npm run build`、publish `.next`（Next.js Runtime 由 Netlify 自動套用）。
3. 在 Site settings → Environment variables 設定 `DATABASE_URL`、`APP_PASSWORD`、`AUTH_SECRET`（可選 `NEXT_PUBLIC_APP_NAME` 等）。
4. 啟用檔案庫：Neon Console → Storage 建立 bucket，取得 S3 端點與金鑰，在 Netlify 加上
   `S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_REGION`、`STORAGE_BUCKET`。
5. CORS 不用手動設定：第一次上傳時，伺服器會自動把目前網站的網域加進 bucket CORS，
   之後換網域、加自訂網域或新的部署網址都一樣自動處理。
   若 bucket 尚未建立，或想手動指定來源，可在本機執行：

   ```bash
   APP_ORIGIN=https://your-site.netlify.app npm run storage:init
   ```

6. 部署後開啟網站 → 輸入 `APP_PASSWORD` 登入。
7. （選用）定期清理沒登記到資料庫的孤兒物件（例如上傳後網路中斷）：

   ```bash
   npm run storage:gc              # 只列出超過 24 小時的孤兒
   npm run storage:gc -- --delete  # 確認後刪除
   ```

> 注意：`DATABASE_URL` 請用 **pooled** 連線；`AUTH_SECRET` 一旦更換，既有 session 會全部失效。

## 部署到 Vercel

Next.js 由 Vercel 原生支援，不需要額外設定（`netlify.toml` 會被忽略，安全標頭改由 `next.config.mjs` 套用）。

1. 同上建立 Neon 專案並建表。
2. Vercel → Add New → Project，匯入此 repo；Framework 自動偵測為 Next.js，Build／Output 用預設值。
3. Settings → Environment Variables 設定 `DATABASE_URL`、`APP_PASSWORD`、`AUTH_SECRET`；
   想在 Preview 部署測試，記得把變數也勾選 Preview 環境。
4. 啟用檔案庫：與 Netlify 相同，設定 `S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_REGION`、`STORAGE_BUCKET`。
5. CORS 會在第一次上傳時自動加入目前網域（Production、Preview、自訂網域都適用），不必手動執行 `storage:init`。

6. 上傳走瀏覽器直傳 bucket 的 presigned URL，不受 Vercel 函式 4.5 MB 請求大小限制。

## 結構

```
app/               頁面與 API 路由（api/health、auth、session、bootstrap、notes、categories、tags、
                   folders、files、storage、ai、mcp）
components/        Sidebar、NoteList、NoteEditor、AiPanel、MarkdownView、Modal、TagPicker、Workspace、
                   FileManager、FolderTree、FilePreview…
lib/               db（Neon HTTP）、data（SQL 存取）、mcp（MCP 協定）、ai（OpenAI 相容呼叫）、diff、media（媒體解析）、store（前端狀態）、theme、
                   storage（S3 用戶端）、file-utils（檔名／MIME）、upload、filedata…
sql/schema.sql     資料表結構（idempotent，供 scripts/init-db.mjs 使用）
sql/neon-editor.sql 同一份結構的「單檔交易」版本，可直接貼進 Neon SQL Editor
scripts/           init-db（建表）、storage-init（bucket + CORS）
dev/               本機測試環境：run-local.sh + Neon HTTP → PostgreSQL shim
tests/             單元測試與 API 整合測試
```