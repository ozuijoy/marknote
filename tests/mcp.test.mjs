/**
 * MCP 端點整合測試：對已啟動的伺服器打 /api/mcp。
 *
 *   BASE_URL=http://127.0.0.1:3100 MCP_TOKEN=xxx npm run test:mcp
 *
 * 伺服器必須以相同的 MCP_TOKEN 啟動（且未設定 MCP_READONLY）。測試會自行清除建立的筆記。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const TOKEN = process.env.MCP_TOKEN || '';
const RUN_ID = Math.random().toString(36).slice(2, 8);
let seq = 0;

async function rpc(body, { token = TOKEN, raw = false, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (raw) return res;
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const call = (method, params) => rpc({ jsonrpc: '2.0', id: ++seq, method, params });
const tool = async (name, args) => (await call('tools/call', { name, arguments: args })).body.result;

test('MCP_TOKEN 未提供時跳過', { skip: !TOKEN && '請設定 MCP_TOKEN' }, async (t) => {
  await t.test('未帶權杖或權杖錯誤回 401', async () => {
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { token: '' })).status, 401);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { token: 'wrong' })).status, 401);
  });

  await t.test('不需要 cookie session（middleware 放行）且回 JSON', async () => {
    const res = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.result.serverInfo.name, 'marknote');
  });

  await t.test('新版 2026-07-28：免 initialize、server/discover、標頭驗證', async () => {
    const V = '2026-07-28';
    const _meta = { 'io.modelcontextprotocol/protocolVersion': V, 'io.modelcontextprotocol/clientCapabilities': {} };
    const modern = (method, params = {}, headers = {}) =>
      rpc({ jsonrpc: '2.0', id: ++seq, method, params: { ...params, _meta } }, { headers: { 'mcp-protocol-version': V, 'mcp-method': method, ...headers } });

    const disc = await modern('server/discover');
    assert.equal(disc.status, 200);
    assert.ok(disc.body.result.supportedVersions.includes(V));
    assert.equal(disc.body.result.resultType, 'complete');

    const list = await modern('tools/list');
    assert.equal(list.status, 200);
    assert.ok(list.body.result.tools.length > 0);

    const call = await modern('tools/call', { name: 'list_tags', arguments: {} }, { 'mcp-name': 'list_tags' });
    assert.equal(call.status, 200);
    assert.equal(call.body.result.resultType, 'complete');

    const noName = await modern('tools/call', { name: 'list_tags', arguments: {} });
    assert.equal(noName.status, 400);
    assert.equal(noName.body.error.code, -32020);

    const init = await modern('initialize');
    assert.equal(init.status, 404);

    const badVer = await rpc(
      { jsonrpc: '2.0', id: ++seq, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } } },
      { headers: { 'mcp-protocol-version': '1900-01-01', 'mcp-method': 'tools/list' } },
    );
    assert.equal(badVer.status, 400);
    assert.equal(badVer.body.error.code, -32022);
  });

  await t.test('通知回 202、壞 JSON 回 parse error、GET 回 405', async () => {
    const n = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { raw: true });
    assert.equal(n.status, 202);
    const bad = await rpc('{nope');
    assert.equal(bad.body.error.code, -32700);
    const get = await fetch(`${BASE}/api/mcp`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(get.status, 405);
  });

  await t.test('批次請求', async () => {
    const res = await rpc([
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'tools/list' },
    ]);
    assert.equal(res.body.length, 2);
    assert.ok(res.body[1].result.tools.some((x) => x.name === 'search_notes'));
  });

  await t.test('筆記完整流程寫入真實資料庫', async () => {
    const title = `MCP 測試 ${RUN_ID}`;
    const created = await tool('create_note', { title, content: `內容 ${RUN_ID}`, tags: [`mcp-${RUN_ID}`] });
    assert.equal(created.isError, undefined, created.content?.[0]?.text);
    const id = created.structuredContent.note.id;

    const found = await tool('search_notes', { query: RUN_ID });
    assert.ok(found.structuredContent.notes.some((n) => n.id === id));

    await tool('append_to_note', { id, content: '- 追加' });
    const got = await tool('get_note', { id });
    assert.equal(got.structuredContent.content, `內容 ${RUN_ID}\n\n- 追加`);

    const read = await call('resources/read', { uri: `marknote://note/${id}` });
    assert.match(read.body.result.contents[0].text, new RegExp(title));

    const del = await tool('delete_note', { id });
    assert.equal(del.structuredContent.deleted, true);
    assert.equal((await tool('get_note', { id })).isError, true);

    // 清掉測試標籤
    const tags = (await tool('list_tags', {})).structuredContent.tags;
    assert.ok(Array.isArray(tags));
  });
});
