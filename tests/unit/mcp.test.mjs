import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION,
  RPC,
  createMcpHandler,
  decodeHeaderValue,
  httpStatusForModern,
  modernVersionOf,
  validateModernHeaders,
  verifyBearer,
} from '../../lib/mcp.js';

/** 記憶體版資料層，介面與 lib/data.js 相同 */
function fakeData() {
  const uuid = () => crypto.randomUUID();
  const categories = [{ id: uuid(), name: '工作', emoji: '💼', note_count: 0 }];
  const notes = new Map();
  const toNote = (n) => ({ ...n, tags: n.tagNames.map((name) => ({ id: name, name })) });
  return {
    categories,
    notes,
    listCategories: async () => categories,
    listTags: async () => {
      const names = new Set([...notes.values()].flatMap((n) => n.tagNames));
      return [...names].map((name) => ({ id: name, name, note_count: 1 }));
    },
    listNotes: async ({ archived = false, categoryId = null, tagId = null, limit = 500 } = {}) =>
      [...notes.values()]
        .filter((n) => n.archived === archived && (!categoryId || n.category_id === categoryId) && (!tagId || n.tagNames.includes(tagId)))
        .slice(0, limit)
        .map((n) => ({ ...toNote(n), excerpt: n.content.slice(0, 20) })),
    searchNotes: async (q, { archived = false } = {}) =>
      [...notes.values()]
        .filter((n) => n.archived === archived && (n.title + n.content).includes(q))
        .map((n) => ({ ...toNote(n), snippet: q })),
    getNote: async (id) => (notes.has(id) ? toNote(notes.get(id)) : null),
    createNote: async ({ title, content, categoryId, tagNames, pinned }) => {
      const id = uuid();
      notes.set(id, { id, title, content, category_id: categoryId, tagNames, pinned, archived: false, updated_at: 'now' });
      return toNote(notes.get(id));
    },
    updateNote: async (id, patch) => {
      const n = notes.get(id);
      if (patch.title !== undefined) n.title = patch.title;
      if (patch.content !== undefined) n.content = patch.content;
      if (patch.archived !== undefined) n.archived = patch.archived;
      if (patch.pinned !== undefined) n.pinned = patch.pinned;
      if (patch.categoryId !== undefined) n.category_id = patch.categoryId;
      if (patch.tagNames !== undefined) n.tagNames = patch.tagNames;
      return toNote(n);
    },
    deleteNote: async (id) => notes.delete(id),
    createCategory: async ({ name, emoji }) => {
      const row = { id: uuid(), name, emoji, note_count: 0 };
      categories.push(row);
      return row;
    },
  };
}

let seq = 0;
const call = (handle, method, params) => handle({ jsonrpc: '2.0', id: ++seq, method, params });
const tool = async (handle, name, args) => (await call(handle, 'tools/call', { name, arguments: args })).result;

test('initialize 協商協定版本並宣告能力', async () => {
  const handle = createMcpHandler(fakeData());
  const res = await call(handle, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(res.result.protocolVersion, '2025-03-26');
  assert.ok(res.result.capabilities.tools);
  assert.ok(res.result.capabilities.resources);
  assert.equal(res.result.serverInfo.name, 'marknote');

  const unknown = await call(handle, 'initialize', { protocolVersion: '1999-01-01' });
  assert.equal(unknown.result.protocolVersion, LATEST_PROTOCOL_VERSION);
});

test('通知不回應；未知方法回 -32601；不合法訊息回 -32600', async () => {
  const handle = createMcpHandler(fakeData());
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await call(handle, 'nope')).error.code, RPC.METHOD_NOT_FOUND);
  assert.equal((await handle({ id: 1, method: 'ping' })).error.code, RPC.INVALID_REQUEST);
  assert.deepEqual((await call(handle, 'ping')).result, {});
});

test('tools/list：唯讀模式隱藏寫入工具', async () => {
  const full = (await call(createMcpHandler(fakeData()), 'tools/list')).result.tools.map((t) => t.name);
  const ro = (await call(createMcpHandler(fakeData(), { readonly: true }), 'tools/list')).result.tools.map((t) => t.name);
  assert.ok(full.includes('create_note') && full.includes('delete_note'));
  assert.ok(!ro.includes('create_note') && !ro.includes('update_note') && !ro.includes('delete_note'));
  assert.ok(ro.includes('search_notes') && ro.includes('get_note'));
  for (const t of (await call(createMcpHandler(fakeData()), 'tools/list')).result.tools) {
    assert.equal(t.inputSchema.type, 'object', `${t.name} 需要 object schema`);
    assert.equal(t.write, undefined, '內部欄位不可外流');
  }
  const blocked = await call(createMcpHandler(fakeData(), { readonly: true }), 'tools/call', { name: 'create_note', arguments: { title: 'x' } });
  assert.equal(blocked.error.code, RPC.INVALID_PARAMS);
});

test('建立、搜尋、讀取、附加、更新、封存、刪除', async () => {
  const data = fakeData();
  const handle = createMcpHandler(data);

  const created = await tool(handle, 'create_note', { title: '週會', content: '討論 MCP', category: '工作', tags: ['會議'] });
  assert.equal(created.isError, undefined);
  const id = created.structuredContent.note.id;
  assert.equal(created.structuredContent.note.category, '工作');
  assert.deepEqual(created.structuredContent.note.tags, ['會議']);

  const found = await tool(handle, 'search_notes', { query: 'MCP' });
  assert.equal(found.structuredContent.count, 1);
  assert.equal(found.structuredContent.notes[0].id, id);

  const listed = await tool(handle, 'list_notes', { tag: '會議' });
  assert.equal(listed.structuredContent.count, 1);

  await tool(handle, 'append_to_note', { id, content: '- 決議：上線' });
  const got = await tool(handle, 'get_note', { id });
  assert.equal(got.structuredContent.content, '討論 MCP\n\n- 決議：上線');
  assert.match(got.content[0].text, /^# 週會/);

  const upd = await tool(handle, 'update_note', { id, title: '週會紀錄', category: '', tags: ['會議', '專案'] });
  assert.equal(upd.structuredContent.note.title, '週會紀錄');
  assert.equal(upd.structuredContent.note.category, '');
  assert.deepEqual(upd.structuredContent.note.tags, ['會議', '專案']);

  await tool(handle, 'archive_note', { id });
  assert.equal(data.notes.get(id).archived, true);
  assert.equal((await tool(handle, 'search_notes', { query: 'MCP' })).structuredContent.count, 0);
  assert.equal((await tool(handle, 'search_notes', { query: 'MCP', archived: true })).structuredContent.count, 1);

  const del = await tool(handle, 'delete_note', { id });
  assert.equal(del.structuredContent.deleted, true);
  assert.equal(data.notes.size, 0);
});

test('工具錯誤以 isError 回報（不是 JSON-RPC 錯誤）', async () => {
  const handle = createMcpHandler(fakeData());
  const badId = await tool(handle, 'get_note', { id: 'abc' });
  assert.equal(badId.isError, true);
  const missing = await tool(handle, 'get_note', { id: crypto.randomUUID() });
  assert.equal(missing.isError, true);
  const badCat = await tool(handle, 'create_note', { title: 'x', category: '不存在' });
  assert.equal(badCat.isError, true);
  assert.match(badCat.content[0].text, /工作/);
  const empty = await tool(handle, 'update_note', { id: (await tool(handle, 'create_note', { title: 'y' })).structuredContent.note.id });
  assert.equal(empty.isError, true);
});

test('create_category 同名不重複建立', async () => {
  const data = fakeData();
  const handle = createMcpHandler(data);
  const a = await tool(handle, 'create_category', { name: '工作' });
  assert.equal(a.structuredContent.created, false);
  const b = await tool(handle, 'create_category', { name: '生活', emoji: '🌱' });
  assert.equal(b.structuredContent.created, true);
  assert.equal(data.categories.length, 2);
});

test('resources：列出與讀取筆記', async () => {
  const handle = createMcpHandler(fakeData());
  const id = (await tool(handle, 'create_note', { title: '資源', content: '內文' })).structuredContent.note.id;
  const list = (await call(handle, 'resources/list')).result.resources;
  assert.equal(list[0].uri, `marknote://note/${id}`);
  const read = (await call(handle, 'resources/read', { uri: `marknote://note/${id}` })).result;
  assert.match(read.contents[0].text, /內文/);
  const nf = await call(handle, 'resources/read', { uri: 'marknote://note/00000000-0000-0000-0000-000000000000' });
  assert.equal(nf.error.code, RPC.RESOURCE_NOT_FOUND);
});

test('verifyBearer', async () => {
  assert.equal(await verifyBearer('Bearer secret-token', 'secret-token'), true);
  assert.equal(await verifyBearer('bearer secret-token', 'secret-token'), true);
  assert.equal(await verifyBearer('Bearer wrong', 'secret-token'), false);
  assert.equal(await verifyBearer('secret-token', 'secret-token'), false);
  assert.equal(await verifyBearer('Bearer x', ''), false);
});

// ── 新版協定 2026-07-28（無狀態、無 initialize）─────────────────────────
const V = '2026-07-28';
const meta = (version = V) => ({
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientInfo': { name: 't', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
});
const modern = (handle, method, params = {}, version = V) =>
  handle({ jsonrpc: '2.0', id: ++seq, method, params: { ...params, _meta: meta(version) } });
const hdrs = (obj) => {
  const m = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (k) => (m.has(k.toLowerCase()) ? m.get(k.toLowerCase()) : null) };
};

test('新版：server/discover 回報支援版本、能力與 serverInfo', async () => {
  const res = (await modern(createMcpHandler(fakeData()), 'server/discover')).result;
  assert.equal(res.resultType, 'complete');
  assert.deepEqual(res.supportedVersions, ALL_PROTOCOL_VERSIONS);
  assert.ok(res.supportedVersions.includes(V) && res.supportedVersions.includes('2025-06-18'));
  assert.ok(res.capabilities.tools && res.capabilities.resources);
  assert.equal(res._meta['io.modelcontextprotocol/serverInfo'].name, 'marknote');
  assert.equal(res.cacheScope, 'private');
  assert.equal(typeof res.ttlMs, 'number');
});

test('新版：不需 initialize 即可直接呼叫工具與資源', async () => {
  const handle = createMcpHandler(fakeData());
  const list = (await modern(handle, 'tools/list')).result;
  assert.equal(list.resultType, 'complete');
  assert.ok(list.tools.some((t) => t.name === 'create_note'));
  assert.equal(list.cacheScope, 'private');

  const created = (await modern(handle, 'tools/call', { name: 'create_note', arguments: { title: '新版', content: '無狀態' } })).result;
  assert.equal(created.resultType, 'complete');
  assert.ok(created._meta['io.modelcontextprotocol/serverInfo']);
  const id = created.structuredContent.note.id;

  const read = (await modern(handle, 'resources/read', { uri: `marknote://note/${id}` })).result;
  assert.match(read.contents[0].text, /無狀態/);
  assert.equal(read.ttlMs, 0);
});

test('新版：不支援的版本回 -32022 並列出支援版本', async () => {
  const res = await modern(createMcpHandler(fakeData()), 'tools/list', {}, '1900-01-01');
  assert.equal(res.error.code, RPC.UNSUPPORTED_PROTOCOL_VERSION);
  assert.deepEqual(res.error.data, { supported: ALL_PROTOCOL_VERSIONS, requested: '1900-01-01' });
  assert.equal(httpStatusForModern(res), 400);
});

test('新版：initialize、ping 已移除，回 -32601（HTTP 404）', async () => {
  const handle = createMcpHandler(fakeData());
  for (const m of ['initialize', 'ping', 'logging/setLevel']) {
    const res = await modern(handle, m);
    assert.equal(res.error.code, RPC.METHOD_NOT_FOUND, m);
    assert.equal(httpStatusForModern(res), 404);
  }
});

test('舊版仍可用；舊版不認得 server/discover', async () => {
  const handle = createMcpHandler(fakeData());
  const init = await call(handle, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.resultType, undefined);
  // 舊版 client 若請求新版號，退回最新的舊版
  assert.equal((await call(handle, 'initialize', { protocolVersion: V })).result.protocolVersion, LATEST_PROTOCOL_VERSION);
  assert.equal((await call(handle, 'server/discover')).error.code, RPC.METHOD_NOT_FOUND);
});

test('modernVersionOf 判斷請求時代', () => {
  assert.equal(modernVersionOf({ params: { _meta: meta() } }), V);
  assert.equal(modernVersionOf({ params: { _meta: { progressToken: 1 } } }), null);
  assert.equal(modernVersionOf({ params: {} }), null);
  assert.equal(modernVersionOf({}), null);
});

test('validateModernHeaders：版本、方法、名稱需與 body 一致', () => {
  const msg = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_note', _meta: meta() } };
  const ok = { 'MCP-Protocol-Version': V, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'get_note' };
  assert.equal(validateModernHeaders(msg, hdrs(ok)), null);

  const bad = (h) => validateModernHeaders(msg, hdrs({ ...ok, ...h }))?.error.code;
  assert.equal(bad({ 'MCP-Protocol-Version': undefined }), RPC.HEADER_MISMATCH);
  assert.equal(bad({ 'MCP-Protocol-Version': '2025-06-18' }), RPC.HEADER_MISMATCH);
  assert.equal(bad({ 'Mcp-Method': 'tools/list' }), RPC.HEADER_MISMATCH);
  assert.equal(bad({ 'Mcp-Name': 'delete_note' }), RPC.HEADER_MISMATCH);

  const noName = { ...ok };
  delete noName['Mcp-Name'];
  assert.equal(validateModernHeaders(msg, hdrs(noName)).error.code, RPC.HEADER_MISMATCH);

  // Base64 編碼的 Mcp-Name
  const enc = `=?base64?${Buffer.from('get_note').toString('base64')}?=`;
  assert.equal(validateModernHeaders(msg, hdrs({ ...ok, 'Mcp-Name': enc })), null);

  // resources/read 比對 uri；list 類請求不需 Mcp-Name
  const uri = 'marknote://note/00000000-0000-0000-0000-000000000000';
  const read = { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri, _meta: meta() } };
  assert.equal(validateModernHeaders(read, hdrs({ 'MCP-Protocol-Version': V, 'Mcp-Method': 'resources/read', 'Mcp-Name': uri })), null);
  const list = { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: meta() } };
  assert.equal(validateModernHeaders(list, hdrs({ 'MCP-Protocol-Version': V, 'Mcp-Method': 'tools/list' })), null);
});

test('decodeHeaderValue', () => {
  assert.equal(decodeHeaderValue('plain'), 'plain');
  assert.equal(decodeHeaderValue('=?base64?SGVsbG8sIOS4lueVjA==?='), 'Hello, 世界');
  assert.equal(decodeHeaderValue('=?base64?!!!?='), null);
});
