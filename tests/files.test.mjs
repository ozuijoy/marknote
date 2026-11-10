/**
 * 檔案庫 API 整合測試（需先啟動 dev/run-local.sh start 的伺服器與 S3 模擬器）。
 *
 *   BASE_URL=http://127.0.0.1:3100 TEST_PASSWORD=xxx node --test tests/files.test.mjs
 *
 * 測試會建立資料夾與檔案，最後遞迴刪除；可重複執行。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.TEST_PASSWORD || 'test-password-123';
const RUN_ID = Math.random().toString(36).slice(2, 8);

let cookie = '';

function rememberCookies(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (!list.length) return;
  const jar = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf('=');
        return [c.slice(0, i), c.slice(i + 1)];
      }),
  );
  for (const raw of list) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function call(path, { method = 'GET', body, useCookie = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (useCookie && cookie) headers.cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  rememberCookies(res);

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

/** 取得上傳票 → PUT 到 S3 → 登記中介資料 */
async function upload({ name, mime, bytes, folderId = null }) {
  const ticket = await call('/api/files/upload-url', {
    method: 'POST',
    body: { name, mime, size: bytes.length, folderId },
  });
  assert.equal(ticket.status, 200, ticket.text);

  const put = await fetch(ticket.json.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime },
    body: bytes,
  });
  assert.ok(put.status >= 200 && put.status < 300, `PUT ${put.status}: ${await put.text()}`);

  const reg = await call('/api/files', {
    method: 'POST',
    body: { key: ticket.json.key, name, mime, size: bytes.length, folderId },
  });
  assert.equal(reg.status, 201, reg.text);
  return { ticket: ticket.json, file: reg.json.file };
}

const state = {};

test('登入並確認物件儲存已設定', async () => {
  const login = await call('/api/auth/login', { method: 'POST', body: { password: PASSWORD }, useCookie: false });
  assert.equal(login.status, 200, login.text);

  const storage = await call('/api/storage');
  assert.equal(storage.status, 200, storage.text);
  assert.equal(storage.json.configured, true, '請確認伺服器已設定 AWS_ENDPOINT_URL_S3 等變數');
  assert.ok(storage.json.maxUploadBytes > 0);
});

test('未登入不可存取檔案庫 API', async () => {
  const res = await call('/api/files', { useCookie: false });
  assert.equal(res.status, 401);
  const res2 = await call('/api/folders', { useCookie: false });
  assert.equal(res2.status, 401);
});

test('建立資料夾與子資料夾', async () => {
  const root = await call('/api/folders', { method: 'POST', body: { name: `素材-${RUN_ID}` } });
  assert.equal(root.status, 201, root.text);
  state.root = root.json.folder;

  const child = await call('/api/folders', { method: 'POST', body: { name: `子目錄-${RUN_ID}`, parentId: state.root.id } });
  assert.equal(child.status, 201, child.text);
  state.child = child.json.folder;
  assert.equal(child.json.folder.parent_id, state.root.id);

  const dup = await call('/api/folders', { method: 'POST', body: { name: `素材-${RUN_ID}` } });
  assert.equal(dup.status, 409);

  const list = await call('/api/folders');
  assert.equal(list.status, 200);
  assert.ok(list.json.folders.some((f) => f.id === state.root.id));
});

test('不能把資料夾搬進自己的子資料夾', async () => {
  const res = await call(`/api/folders/${state.root.id}`, { method: 'PATCH', body: { parentId: state.child.id } });
  assert.equal(res.status, 400, res.text);
});

test('上傳文字檔並登記（presigned PUT）', async () => {
  const bytes = Buffer.from('hello marknote\n第二行\n', 'utf8');
  const { file, ticket } = await upload({
    name: `筆記-${RUN_ID}.txt`,
    mime: 'text/plain',
    bytes,
    folderId: state.root.id,
  });
  assert.equal(file.size, bytes.length);
  assert.equal(file.folder_id, state.root.id);
  assert.match(file.rawUrl, /^\/api\/files\/[0-9a-f-]{36}\/raw$/);
  assert.match(ticket.key, /^files\/[0-9a-f-]{36}$/);
  state.text = { ...file, key: ticket.key };
});

test('上傳圖片並可透過 raw 轉址取得內容', async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const { file } = await upload({ name: `圖片-${RUN_ID}.png`, mime: 'image/png', bytes, folderId: null });
  state.image = file;

  const raw = await call(`/api/files/${file.id}/raw`);
  assert.equal(raw.status, 302, raw.text);
  const location = raw.headers.get('location');
  assert.ok(location, '應回傳 presigned 網址');

  const object = await fetch(location);
  assert.equal(object.status, 200);
  assert.equal(object.headers.get('content-type'), 'image/png');
  const body = Buffer.from(await object.arrayBuffer());
  assert.deepEqual(body, bytes);
});

test('清單、重新命名與移動檔案', async () => {
  const list = await call(`/api/files?folderId=${state.root.id}`);
  assert.equal(list.status, 200, list.text);
  assert.ok(list.json.files.some((f) => f.id === state.text.id));
  assert.equal(list.json.path.at(-1).id, state.root.id);

  const renamed = await call(`/api/files/${state.text.id}`, { method: 'PATCH', body: { name: `改名-${RUN_ID}.txt` } });
  assert.equal(renamed.status, 200, renamed.text);
  assert.equal(renamed.json.file.name, `改名-${RUN_ID}.txt`);

  const moved = await call(`/api/files/${state.text.id}`, { method: 'PATCH', body: { folderId: state.child.id } });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.json.file.folder_id, state.child.id);

  const after = await call(`/api/files?folderId=${state.child.id}`);
  assert.ok(after.json.files.some((f) => f.id === state.text.id));
});

test('非空資料夾需 recursive 才能刪除', async () => {
  const res = await call(`/api/folders/${state.root.id}`, { method: 'DELETE' });
  assert.equal(res.status, 409, res.text);
  assert.equal(res.json.code, 'NOT_EMPTY');
  assert.ok(res.json.fileCount >= 1);
});

test('上傳 HTML 時 raw 必須以附件下載（防 XSS）', async () => {
  const { file } = await upload({
    name: `evil-${RUN_ID}.html`,
    mime: 'text/html',
    bytes: Buffer.from('<script>alert(1)</script>'),
    folderId: null,
  });
  state.html = file;
  const raw = await call(`/api/files/${file.id}/raw`);
  assert.equal(raw.status, 302);
  assert.match(raw.headers.get('location'), /response-content-disposition=attachment/i);
});

test('拒絕非法 key 與超大檔案', async () => {
  const bad = await call('/api/files', {
    method: 'POST',
    body: { key: '../../etc/passwd', name: 'x', mime: 'text/plain', size: 1 },
  });
  assert.equal(bad.status, 400, bad.text);

  const tooBig = await call('/api/files/upload-url', {
    method: 'POST',
    body: { name: 'huge.bin', mime: 'application/octet-stream', size: 10 * 1024 * 1024 * 1024 },
  });
  assert.equal(tooBig.status, 413, tooBig.text);
});

test('刪除檔案會同時移除物件', async () => {
  const del = await call(`/api/files/${state.image.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200, del.text);
  const gone = await call(`/api/files/${state.image.id}`);
  assert.equal(gone.status, 404);
});

test('遞迴刪除資料夾（含子資料夾與檔案）', async () => {
  const res = await call(`/api/folders/${state.root.id}?recursive=1`, { method: 'DELETE' });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.deleted.files >= 1);

  const list = await call('/api/folders');
  assert.ok(!list.json.folders.some((f) => f.id === state.root.id));
  assert.ok(!list.json.folders.some((f) => f.id === state.child.id));

  const file = await call(`/api/files/${state.text.id}`);
  assert.equal(file.status, 404);
});

test('清理測試資料', async () => {
  if (state.html) await call(`/api/files/${state.html.id}`, { method: 'DELETE' });

  const total = await call('/api/storage');
  assert.equal(total.status, 200);
});