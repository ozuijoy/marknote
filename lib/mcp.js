/**
 * MCP（Model Context Protocol）伺服器核心：JSON-RPC 2.0 訊息處理。
 * 傳輸層（Streamable HTTP）在 app/api/mcp/route.js；這裡不碰 HTTP、不讀環境變數，
 * 資料存取由呼叫端注入（正式環境為 lib/data.js），方便單元測試。
 */

/**
 * 協定版本（雙時代伺服器，見規格 2026-07-28 basic/versioning）：
 * - 新版（modern）：每個請求在 params._meta 帶版本，無 initialize 握手、無 session
 * - 舊版（legacy）：先 initialize 協商，之後的請求不帶版本
 */
export const MODERN_PROTOCOL_VERSIONS = ['2026-07-28'];
export const LEGACY_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** 舊版 initialize 協商用（相容既有匯出名稱） */
export const SUPPORTED_PROTOCOL_VERSIONS = LEGACY_PROTOCOL_VERSIONS;
export const LATEST_PROTOCOL_VERSION = LEGACY_PROTOCOL_VERSIONS[0];
export const LATEST_MODERN_PROTOCOL_VERSION = MODERN_PROTOCOL_VERSIONS[0];
export const ALL_PROTOCOL_VERSIONS = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS];

export const META = {
  PROTOCOL_VERSION: 'io.modelcontextprotocol/protocolVersion',
  CLIENT_INFO: 'io.modelcontextprotocol/clientInfo',
  CLIENT_CAPABILITIES: 'io.modelcontextprotocol/clientCapabilities',
  SERVER_INFO: 'io.modelcontextprotocol/serverInfo',
};

/** 請求若在 _meta 帶了協定版本，就是新版請求；回傳該版本字串，否則 null */
export function modernVersionOf(message) {
  const meta = message?.params?._meta;
  if (!meta || typeof meta !== 'object' || !(META.PROTOCOL_VERSION in meta)) return null;
  return String(meta[META.PROTOCOL_VERSION] ?? '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_URI_RE = /^marknote:\/\/note\/([0-9a-f-]{36})$/i;

/** JSON-RPC 錯誤碼 */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RESOURCE_NOT_FOUND: -32002,
  // MCP 2026-07-28 保留碼
  HEADER_MISMATCH: -32020,
  MISSING_REQUIRED_CLIENT_CAPABILITY: -32021,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
};

class ToolError extends Error {}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const int = (description, min, max) => ({ type: 'integer', description, minimum: min, maximum: max });
const strList = (description) => ({ type: 'array', items: { type: 'string' }, description });

const NOTE_ID = str('筆記 ID（UUID）');
const CATEGORY = str('分類：分類 ID 或名稱（不分大小寫）；空字串代表「未分類」');

/** 工具定義：write=true 的工具在唯讀模式下不會出現 */
const TOOL_DEFS = [
  {
    name: 'search_notes',
    title: '搜尋筆記',
    description: '以關鍵字搜尋筆記（比對標題、內文與標籤名）。回傳摘要清單，完整內文請用 get_note。',
    inputSchema: {
      type: 'object',
      properties: {
        query: str('關鍵字'),
        archived: bool('是否搜尋已封存的筆記，預設 false'),
        limit: int('最多回傳幾筆，預設 20', 1, 100),
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_notes',
    title: '列出筆記',
    description: '列出筆記（依釘選與更新時間排序），可依分類或標籤篩選。回傳摘要，不含完整內文。',
    inputSchema: {
      type: 'object',
      properties: {
        category: CATEGORY,
        tag: str('標籤名稱或 ID'),
        archived: bool('是否列出已封存的筆記，預設 false'),
        limit: int('最多回傳幾筆，預設 50', 1, 500),
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_note',
    title: '讀取筆記',
    description: '讀取單篇筆記的完整 Markdown 內文、分類與標籤。',
    inputSchema: { type: 'object', properties: { id: NOTE_ID }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_categories',
    title: '列出分類',
    description: '列出所有分類（含每個分類的筆記數）。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_tags',
    title: '列出標籤',
    description: '列出所有標籤（含每個標籤的筆記數）。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_note',
    title: '建立筆記',
    description: '建立新筆記。content 為 Markdown；tags 中不存在的標籤會自動建立；category 必須是既有分類。',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        title: str('標題'),
        content: str('Markdown 內文'),
        category: CATEGORY,
        tags: strList('標籤名稱'),
        pinned: bool('是否釘選'),
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'update_note',
    title: '更新筆記',
    description: '更新筆記；只會變更有提供的欄位。content 會整份取代內文；tags 會整組取代標籤。',
    write: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: NOTE_ID,
        title: str('新標題'),
        content: str('新的完整 Markdown 內文（整份取代）'),
        category: CATEGORY,
        tags: strList('新的標籤清單（整組取代）'),
        pinned: bool('是否釘選'),
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'append_to_note',
    title: '附加到筆記',
    description: '在筆記內文最後附加一段 Markdown（自動以空行分隔），不影響原有內容。',
    write: true,
    inputSchema: {
      type: 'object',
      properties: { id: NOTE_ID, content: str('要附加的 Markdown') },
      required: ['id', 'content'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'archive_note',
    title: '封存／還原筆記',
    description: '封存筆記（archived=true，預設）或從封存還原（archived=false）。',
    write: true,
    inputSchema: {
      type: 'object',
      properties: { id: NOTE_ID, archived: bool('true 封存、false 還原，預設 true') },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'delete_note',
    title: '刪除筆記',
    description: '永久刪除筆記，無法復原。若只是想收起來，請改用 archive_note。',
    write: true,
    inputSchema: { type: 'object', properties: { id: NOTE_ID }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: 'create_category',
    title: '建立分類',
    description: '建立新分類；同名（不分大小寫）已存在時直接回傳既有分類。',
    write: true,
    inputSchema: {
      type: 'object',
      properties: { name: str('分類名稱'), emoji: str('顯示用 emoji（選填）') },
      required: ['name'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
];

/**
 * 建立 MCP 訊息處理器。
 * @param {object} data   資料存取函式（同 lib/data.js 的介面）
 * @param {{readonly?: boolean, serverInfo?: {name: string, version: string}, instructions?: string}} [options]
 * @returns {(message: any) => Promise<object|null>} 處理單一 JSON-RPC 訊息；通知回傳 null
 */
export function createMcpHandler(data, options = {}) {
  const readonly = options.readonly === true;
  const serverInfo = options.serverInfo || { name: 'marknote', version: '1.0.0' };
  const tools = TOOL_DEFS.filter((t) => !(readonly && t.write));
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // ── 小工具 ──────────────────────────────────────────────────────────
  const requireId = (value) => {
    const id = String(value ?? '').trim();
    if (!UUID_RE.test(id)) throw new ToolError('id 必須是筆記的 UUID');
    return id;
  };

  const requireNote = async (id) => {
    const note = await data.getNote(id);
    if (!note) throw new ToolError(`找不到筆記 ${id}`);
    return note;
  };

  const categoryIndex = async () => {
    const list = (await data.listCategories()) || [];
    return {
      list,
      byId: new Map(list.map((c) => [String(c.id).toLowerCase(), c])),
      byName: new Map(list.map((c) => [String(c.name).toLowerCase(), c])),
    };
  };

  /** 分類 ID 或名稱 → ID；空字串 → null；undefined → undefined（不變更） */
  const resolveCategory = async (value, index) => {
    if (value === undefined || value === null) return undefined;
    const key = String(value).trim();
    if (!key) return null;
    const idx = index || (await categoryIndex());
    const hit = idx.byId.get(key.toLowerCase()) || idx.byName.get(key.toLowerCase());
    if (!hit) {
      const names = idx.list.map((c) => c.name).join('、') || '（目前沒有分類）';
      throw new ToolError(`找不到分類「${key}」。現有分類：${names}。如需新分類請先呼叫 create_category。`);
    }
    return hit.id;
  };

  const resolveTagId = async (value) => {
    const key = String(value ?? '').trim().replace(/^#/, '');
    if (!key) return null;
    const list = (await data.listTags()) || [];
    const hit = list.find((t) => String(t.id).toLowerCase() === key.toLowerCase() || String(t.name).toLowerCase() === key.toLowerCase());
    if (!hit) throw new ToolError(`找不到標籤「${key}」`);
    return hit.id;
  };

  const tagList = (value) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new ToolError('tags 必須是字串陣列');
    return value.map((t) => String(t ?? '').trim()).filter(Boolean);
  };

  const withCategoryName = (idx) => (n) => {
    const c = n.category_id ? idx.byId.get(String(n.category_id).toLowerCase()) : null;
    return c ? c.name : '';
  };

  const summarize = (idx) => {
    const catName = withCategoryName(idx);
    return (n) => ({
      id: n.id,
      title: n.title || '未命名筆記',
      category: catName(n),
      tags: (n.tags || []).map((t) => t.name),
      pinned: Boolean(n.pinned),
      archived: Boolean(n.archived),
      updated_at: n.updated_at,
      excerpt: n.snippet || n.excerpt || '',
    });
  };

  const fullNote = (idx, n) => ({
    id: n.id,
    title: n.title || '',
    category: withCategoryName(idx)(n),
    category_id: n.category_id || null,
    tags: (n.tags || []).map((t) => t.name),
    pinned: Boolean(n.pinned),
    archived: Boolean(n.archived),
    created_at: n.created_at,
    updated_at: n.updated_at,
    content: n.content ?? '',
  });

  const noteMarkdown = (note) => {
    const meta = [
      `id: ${note.id}`,
      `category: ${note.category || '未分類'}`,
      `tags: ${note.tags.length ? note.tags.join(', ') : '（無）'}`,
      `updated_at: ${note.updated_at}`,
    ];
    if (note.archived) meta.push('archived: true');
    return `# ${note.title || '未命名筆記'}\n\n<!-- ${meta.join(' | ')} -->\n\n${note.content}`;
  };

  const ok = (payload, text) => ({
    content: [{ type: 'text', text: text ?? JSON.stringify(payload, null, 2) }],
    structuredContent: Array.isArray(payload) ? { items: payload } : payload,
  });

  // ── 工具實作 ────────────────────────────────────────────────────────
  const handlers = {
    async search_notes(args) {
      const q = String(args.query ?? '').trim();
      if (!q) throw new ToolError('query 不可為空');
      const limit = clampInt(args.limit, 20, 1, 100);
      const [rows, idx] = await Promise.all([data.searchNotes(q, { archived: args.archived === true, limit }), categoryIndex()]);
      const notes = (rows || []).slice(0, limit).map(summarize(idx));
      return ok({ query: q, count: notes.length, notes });
    },

    async list_notes(args) {
      const limit = clampInt(args.limit, 50, 1, 500);
      const idx = await categoryIndex();
      const categoryId = args.category === undefined || args.category === '' ? null : await resolveCategory(args.category, idx);
      const tagId = args.tag ? await resolveTagId(args.tag) : null;
      const rows = await data.listNotes({ archived: args.archived === true, categoryId, tagId, limit });
      const notes = (rows || []).slice(0, limit).map(summarize(idx));
      return ok({ count: notes.length, notes });
    },

    async get_note(args) {
      const id = requireId(args.id);
      const [note, idx] = await Promise.all([requireNote(id), categoryIndex()]);
      const full = fullNote(idx, note);
      return ok(full, noteMarkdown(full));
    },

    async list_categories() {
      const list = (await data.listCategories()) || [];
      return ok({
        categories: list.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || '', note_count: c.note_count ?? 0 })),
      });
    },

    async list_tags() {
      const list = (await data.listTags()) || [];
      return ok({ tags: list.map((t) => ({ id: t.id, name: t.name, note_count: t.note_count ?? 0 })) });
    },

    async create_note(args) {
      const idx = await categoryIndex();
      const categoryId = await resolveCategory(args.category, idx);
      const note = await data.createNote({
        title: String(args.title ?? '').trim().slice(0, 500),
        content: args.content === undefined ? '' : String(args.content),
        categoryId: categoryId || null,
        tagNames: tagList(args.tags) || [],
        pinned: args.pinned === true,
      });
      return ok({ created: true, note: fullNote(idx, note) });
    },

    async update_note(args) {
      const id = requireId(args.id);
      await requireNote(id);
      const idx = await categoryIndex();
      const patch = {};
      if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 500);
      if (args.content !== undefined) patch.content = String(args.content);
      if (args.pinned !== undefined) patch.pinned = args.pinned === true;
      const categoryId = await resolveCategory(args.category, idx);
      if (categoryId !== undefined) patch.categoryId = categoryId;
      const tags = tagList(args.tags);
      if (tags !== undefined) patch.tagNames = tags;
      if (!Object.keys(patch).length) throw new ToolError('沒有提供任何要更新的欄位');
      const note = await data.updateNote(id, patch);
      return ok({ updated: true, note: fullNote(idx, note) });
    },

    async append_to_note(args) {
      const id = requireId(args.id);
      const addition = String(args.content ?? '');
      if (!addition.trim()) throw new ToolError('content 不可為空');
      const note = await requireNote(id);
      const current = note.content || '';
      const gap = !current ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
      const updated = await data.updateNote(id, { content: `${current}${gap}${addition}` });
      const idx = await categoryIndex();
      return ok({ updated: true, note: fullNote(idx, updated) });
    },

    async archive_note(args) {
      const id = requireId(args.id);
      await requireNote(id);
      const archived = args.archived !== false;
      await data.updateNote(id, { archived });
      return ok({ id, archived });
    },

    async delete_note(args) {
      const id = requireId(args.id);
      const removed = await data.deleteNote(id);
      if (!removed) throw new ToolError(`找不到筆記 ${id}`);
      return ok({ id, deleted: true });
    },

    async create_category(args) {
      const name = String(args.name ?? '').trim().slice(0, 60);
      if (!name) throw new ToolError('name 不可為空');
      const idx = await categoryIndex();
      const existing = idx.byName.get(name.toLowerCase());
      if (existing) return ok({ created: false, category: { id: existing.id, name: existing.name, emoji: existing.emoji || '' } });
      const row = await data.createCategory({ name, emoji: String(args.emoji ?? '').slice(0, 16) });
      return ok({ created: true, category: { id: row.id, name: row.name, emoji: row.emoji || '' } });
    },
  };

  // ── 資源：每篇筆記以 marknote://note/{id} 提供 Markdown ─────────────
  const resources = {
    async list(params = {}) {
      const offset = Math.max(0, Number.parseInt(params.cursor || '0', 10) || 0);
      const pageSize = 100;
      const rows = (await data.listNotes({ archived: false, limit: 1000 })) || [];
      const page = rows.slice(offset, offset + pageSize);
      const result = {
        resources: page.map((n) => ({
          uri: `marknote://note/${n.id}`,
          name: n.title || '未命名筆記',
          title: n.title || '未命名筆記',
          description: n.excerpt || '',
          mimeType: 'text/markdown',
        })),
      };
      if (offset + pageSize < rows.length) result.nextCursor = String(offset + pageSize);
      return result;
    },
    async read(params = {}) {
      const uri = String(params.uri || '');
      const m = uri.match(NOTE_URI_RE);
      if (!m) throw rpcError(RPC.RESOURCE_NOT_FOUND, `找不到資源：${uri}`, { uri });
      const [note, idx] = await Promise.all([data.getNote(m[1]), categoryIndex()]);
      if (!note) throw rpcError(RPC.RESOURCE_NOT_FOUND, `找不到資源：${uri}`, { uri });
      return { contents: [{ uri, mimeType: 'text/markdown', text: noteMarkdown(fullNote(idx, note)) }] };
    },
  };

  const instructions =
    options.instructions ||
    [
      'MarkNote 是 Markdown 筆記庫。',
      '先用 search_notes 或 list_notes 找到筆記，再用 get_note 讀取完整內文。',
      'update_note 的 content 會整份取代內文；只想加內容請用 append_to_note。',
      '分類必須事先存在（可用 list_categories 查看、create_category 建立）；標籤會自動建立。',
      readonly ? '目前為唯讀模式，只能讀取。' : '',
    ]
      .filter(Boolean)
      .join('\n');

  // ── 方法分派 ────────────────────────────────────────────────────────
  const methods = {
    initialize(params = {}) {
      const requested = String(params.protocolVersion || '');
      return {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
        serverInfo: { ...serverInfo, title: 'MarkNote' },
        instructions,
      };
    },
    ping: () => ({}),
    'tools/list': () => ({
      tools: tools.map(({ write, ...t }) => t),
    }),
    async 'tools/call'(params = {}) {
      const name = String(params.name || '');
      const tool = toolMap.get(name);
      if (!tool) {
        const hidden = TOOL_DEFS.some((t) => t.name === name);
        throw rpcError(RPC.INVALID_PARAMS, hidden ? `工具 ${name} 在唯讀模式下停用` : `未知的工具：${name}`);
      }
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        return await handlers[name](args);
      } catch (err) {
        if (err instanceof ToolError) {
          return { content: [{ type: 'text', text: err.message }], isError: true };
        }
        throw err;
      }
    },
    'resources/list': (params) => resources.list(params),
    'resources/read': (params) => resources.read(params),
    'resources/templates/list': () => ({
      resourceTemplates: [
        { uriTemplate: 'marknote://note/{id}', name: 'note', title: '筆記', description: '以 ID 讀取單篇筆記的 Markdown', mimeType: 'text/markdown' },
      ],
    }),
    'prompts/list': () => ({ prompts: [] }),
    'logging/setLevel': () => ({}),
  };

  // ── 新版（2026-07-28）方法：無 initialize／ping／logging/setLevel，新增 server/discover ──
  const capabilities = { tools: {}, resources: {} };
  const modernMethods = {
    'server/discover': () => ({
      supportedVersions: ALL_PROTOCOL_VERSIONS,
      capabilities,
      instructions,
    }),
    'tools/list': methods['tools/list'],
    'tools/call': methods['tools/call'],
    'resources/list': methods['resources/list'],
    'resources/read': methods['resources/read'],
    'resources/templates/list': methods['resources/templates/list'],
    'prompts/list': methods['prompts/list'],
  };
  // 可快取結果（CacheableResult）：筆記屬於個人資料，只允許同一授權範圍內快取
  const CACHEABLE = {
    'server/discover': 5 * 60 * 1000,
    'tools/list': 5 * 60 * 1000,
    'resources/templates/list': 5 * 60 * 1000,
    'prompts/list': 5 * 60 * 1000,
    'resources/list': 0,
    'resources/read': 0,
  };

  async function handleModern(message, version) {
    if (!MODERN_PROTOCOL_VERSIONS.includes(version)) {
      return errorResponse(message.id ?? null, RPC.UNSUPPORTED_PROTOCOL_VERSION, `不支援的協定版本：${version || '(空白)'}`, {
        supported: ALL_PROTOCOL_VERSIONS,
        requested: version,
      });
    }
    if (!('id' in message)) return null;
    const fn = modernMethods[message.method];
    if (!fn) return errorResponse(message.id, RPC.METHOD_NOT_FOUND, `不支援的方法：${message.method}`);
    try {
      const { _meta, ...params } = message.params || {};
      const body = await fn(params);
      const result = { resultType: 'complete', ...body, _meta: { ...(body?._meta || {}), [META.SERVER_INFO]: serverInfo } };
      if (message.method in CACHEABLE) {
        result.ttlMs = CACHEABLE[message.method];
        result.cacheScope = 'private';
      }
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (err) {
      if (err?.rpcCode) return errorResponse(message.id, err.rpcCode, err.message, err.rpcData);
      console.error('[mcp error]', err);
      return errorResponse(message.id, RPC.INTERNAL_ERROR, `伺服器錯誤：${err?.message || err}`);
    }
  }

  return async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return errorResponse(message?.id ?? null, RPC.INVALID_REQUEST, '不是合法的 JSON-RPC 2.0 訊息');
    }
    // 回應（client 回覆 server 的請求）：不需要回傳
    if (!message.method) return null;

    const modern = modernVersionOf(message);
    if (modern !== null) return handleModern(message, modern);

    // 舊版：通知不需要回傳
    if (!('id' in message)) return null;

    const fn = methods[message.method];
    if (!fn) return errorResponse(message.id, RPC.METHOD_NOT_FOUND, `不支援的方法：${message.method}`);
    try {
      const result = await fn(message.params);
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (err) {
      if (err?.rpcCode) return errorResponse(message.id, err.rpcCode, err.message, err.rpcData);
      console.error('[mcp error]', err);
      return errorResponse(message.id, RPC.INTERNAL_ERROR, `伺服器錯誤：${err?.message || err}`);
    }
  };
}

export function errorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

/**
 * 依 2026-07-28 Streamable HTTP 規則驗證新版請求的 HTTP 標頭。
 * headers 需有 get(name)（不分大小寫）。通過回傳 null，否則回傳 JSON-RPC 錯誤回應。
 */
export function validateModernHeaders(message, headers) {
  const id = message?.id ?? null;
  const bodyVersion = modernVersionOf(message);
  const mismatch = (msg) => errorResponse(id, RPC.HEADER_MISMATCH, `標頭不符：${msg}`);

  const hVersion = headers.get('mcp-protocol-version');
  if (!hVersion) return mismatch('缺少 MCP-Protocol-Version');
  if (hVersion !== bodyVersion) return mismatch(`MCP-Protocol-Version「${hVersion}」與 _meta 的「${bodyVersion}」不同`);

  const hMethod = headers.get('mcp-method');
  if (!hMethod) return mismatch('缺少 Mcp-Method');
  if (hMethod !== message.method) return mismatch(`Mcp-Method「${hMethod}」與 method「${message.method}」不同`);

  const nameSource = { 'tools/call': 'name', 'prompts/get': 'name', 'resources/read': 'uri' }[message.method];
  if (nameSource) {
    const raw = headers.get('mcp-name');
    if (raw === null || raw === undefined) return mismatch('缺少 Mcp-Name');
    const decoded = decodeHeaderValue(raw);
    if (decoded === null) return mismatch('Mcp-Name 的 Base64 編碼無效');
    const bodyValue = String(message.params?.[nameSource] ?? '');
    if (decoded !== bodyValue) return mismatch(`Mcp-Name「${decoded}」與 params.${nameSource}「${bodyValue}」不同`);
  }
  return null;
}

/** 解開 =?base64?...?= 編碼的標頭值；格式錯誤回傳 null */
export function decodeHeaderValue(value) {
  const m = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!m) return value;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(m[1]) || m[1].length % 4 !== 0) return null;
  return Buffer.from(m[1], 'base64').toString('utf8');
}

/** 新版錯誤對應的 HTTP 狀態碼（規格要求 400／404；其餘錯誤照常 200） */
export function httpStatusForModern(response) {
  const code = response?.error?.code;
  if (code === RPC.METHOD_NOT_FOUND) return 404;
  if ([RPC.HEADER_MISMATCH, RPC.MISSING_REQUIRED_CLIENT_CAPABILITY, RPC.UNSUPPORTED_PROTOCOL_VERSION].includes(code)) return 400;
  return 200;
}

function rpcError(code, message, data) {
  const err = new Error(message);
  err.rpcCode = code;
  err.rpcData = data;
  return err;
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** 解析 Authorization: Bearer xxx，與設定的權杖做定長比對 */
export async function verifyBearer(header, expected) {
  if (!expected) return false;
  const m = String(header || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const enc = new TextEncoder();
  const digest = async (s) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(s)));
  const [a, b] = await Promise.all([digest(m[1].trim()), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
