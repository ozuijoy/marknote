/**
 * API 整合測試：對「已啟動的 MarkNote 伺服器」打真實 HTTP 請求。
 *
 *   BASE_URL=http://127.0.0.1:3100 TEST_PASSWORD=xxx npm run test:api
 *
 * 測試會自己建立／清除資料，可重複執行（每次使用隨機的識別字串）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.TEST_PASSWORD || 'test-password-123';
const RUN_ID = Math.random().toString(36).slice(2, 8);

let cookie = '';

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

  // 記住最新 cookie（登入／登出都會重設）
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    const jar = new Map(
      cookie
        .split('; ')
        .filter(Boolean)
        .map((c) => {
          const i = c.indexOf('=');
          return [c.slice(0, i), c.slice(i + 1)];
        }),
    );
    if (value) jar.set(name, value);
    else jar.delete(name);
    cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON（HTML）回應 */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const uniq = (prefix) => `${prefix}-${RUN_ID}-${Math.random().toString(36).slice(2, 6)}`;

// 跨測試共用的識別碼
const ids = {};

test('健康檢查：/api/health 回報環境與資料庫狀態', async () => {
  const res = await call('/api/health', { useCookie: false });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.ok, true);
  assert.deepEqual(res.json.missingEnv, []);
  assert.equal(res.json.db.ok, true);
});

test('未登入：API 回 401、頁面導向 /login', async () => {
  const api = await call('/api/bootstrap', { useCookie: false });
  assert.equal(api.status, 401);
  assert.ok(api.json.error);

  const page = await call('/', { useCookie: false });
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location'), BASE).pathname, '/login');
});

test('登入：錯誤密碼回 401，正確密碼取得 session cookie', async () => {
  const bad = await call('/api/auth/login', { method: 'POST', body: { password: 'wrong-password' }, useCookie: false });
  assert.equal(bad.status, 401);

  const empty = await call('/api/auth/login', { method: 'POST', body: {}, useCookie: false });
  assert.equal(empty.status, 401);

  const ok = await call('/api/auth/login', { method: 'POST', body: { password: PASSWORD }, useCookie: false });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.db.ok, true);
  assert.ok(Array.isArray(ok.json.embedHosts) && ok.json.embedHosts.length > 0);
  assert.ok(cookie.includes('session'), `應取得 session cookie，實際：${cookie}`);

  const session = await call('/api/session');
  assert.equal(session.status, 200);
  assert.equal(session.json.authenticated, true);
});

test('登入後：/ 回傳工作區 HTML', async () => {
  const res = await call('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /<html/i);
});

test('分類：建立、重名冲突、列表計數', async () => {
  const name = uniq('工作');
  const res = await call('/api/categories', { method: 'POST', body: { name, emoji: '📁', color: '#337ea9' } });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.json.category.id);
  assert.equal(res.json.category.name, name);
  assert.equal(Number(res.json.category.note_count), 0);
  ids.category = res.json.category.id;
  ids.categoryName = name;

  // 大小寫不同但同名 → 唯一索引冲突
  const dup = await call('/api/categories', { method: 'POST', body: { name: name.toUpperCase() } });
  assert.equal(dup.status, 409, dup.text);

  const blank = await call('/api/categories', { method: 'POST', body: { name: '   ' } });
  assert.equal(blank.status, 400);
});

test('標籤：建立與重複建立（回傳既有標籤）', async () => {
  const name = uniq('媒體');
  const res = await call('/api/tags', { method: 'POST', body: { name, color: '#44835c' } });
  assert.equal(res.status, 201, res.text);
  ids.tag = res.json.tag.id;
  ids.tagName = name;

  const again = await call('/api/tags', { method: 'POST', body: { name: `#${name}` } });
  assert.equal(again.status, 201);
  assert.equal(again.json.tag.id, ids.tag, '同名標籤應沿用既有紀錄');
});

test('筆記：建立（含外鏈媒體與自動建立標籤）', async () => {
  const content = [
    '# 媒體測試',
    '',
    `唯一識別字 ${RUN_ID}-SECRET-KEYWORD`,
    '',
    '![圖片](https://picsum.photos/800/400)',
    '',
    '<audio controls src="https://example.com/sound.mp3"></audio>',
    '',
    '<video controls src="https://example.com/clip.mp4"></video>',
    '',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '',
    '- [ ] 待辦項目',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1;',
    '```',
  ].join('\n');

  const res = await call('/api/notes', {
    method: 'POST',
    body: { title: '媒體與 Markdown 測試', content, categoryId: ids.category, tagNames: [ids.tagName, uniq('新標籤')] },
  });
  assert.equal(res.status, 201, res.text);
  const note = res.json.note;
  ids.note = note.id;
  assert.equal(note.content, content, '內容應原樣保存');
  assert.equal(note.category_id, ids.category);
  assert.equal(note.tags.length, 2, '應包含既有標籤與自動建立的新標籤');
  assert.equal(note.pinned, false);
});

test('bootstrap：一次回傳分類／標籤／筆記清單（不含完整內文）', async () => {
  const res = await call('/api/bootstrap');
  assert.equal(res.status, 200, res.text);
  const { categories, tags, notes, appName, embedHosts } = res.json;
  assert.ok(appName);
  assert.ok(embedHosts.includes('www.youtube.com'));

  const cat = categories.find((c) => c.id === ids.category);
  assert.ok(cat, '應包含剛建立的分類');
  assert.equal(Number(cat.note_count), 1);

  const tag = tags.find((t) => t.id === ids.tag);
  assert.ok(tag);
  assert.equal(Number(tag.note_count), 1);

  const item = notes.find((n) => n.id === ids.note);
  assert.ok(item, '應包含剛建立的筆記');
  assert.equal(item.content, undefined, '列表不應回傳完整內文');
  assert.equal(item.has_media, true, '含外鏈媒體的筆記應標記 has_media');
  assert.ok(item.excerpt.includes('媒體測試'), `摘要應來自內文：${item.excerpt}`);
  assert.equal(item.tags.length, 2);
  assert.ok(res.json.archivedCount >= 0);
});

test('筆記：讀取單筆完整內容', async () => {
  const res = await call(`/api/notes/${ids.note}`);
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.note.content, /SECRET-KEYWORD/);
  assert.match(res.json.note.content, /<video controls/);
});

test('筆記：ID 格式錯誤回 400、不存在回 404', async () => {
  assert.equal((await call('/api/notes/not-a-uuid')).status, 400);
  assert.equal((await call('/api/notes/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal(
    (await call('/api/notes/00000000-0000-4000-8000-000000000000', { method: 'PATCH', body: { title: 'x' } })).status,
    404,
  );
  assert.equal((await call('/api/notes/not-a-uuid', { method: 'DELETE' })).status, 400);
});

test('筆記：更新標題／內文／釘選／分類／標籤（含 transaction）', async () => {
  const res = await call(`/api/notes/${ids.note}`, {
    method: 'PATCH',
    body: { title: '已更新標題', content: '更新後的內容 with KEYWORD-UPDATED', pinned: true, categoryId: '', tagNames: [ids.tagName] },
  });
  assert.equal(res.status, 200, res.text);
  const note = res.json.note;
  assert.equal(note.title, '已更新標題');
  assert.equal(note.content, '更新後的內容 with KEYWORD-UPDATED');
  assert.equal(note.pinned, true);
  assert.equal(note.category_id, null, 'categoryId 給空字串應变成未分類');
  assert.equal(note.tags.length, 1);
  assert.equal(note.tags[0].id, ids.tag);
});

test('筆記：不存在的分類 ID 回 400', async () => {
  const res = await call(`/api/notes/${ids.note}`, { method: 'PATCH', body: { categoryId: 'not-a-uuid' } });
  assert.equal(res.status, 400);
});

test('搜尋：關鍵字命中內文並回傳 snippet；無命中回空陣列', async () => {
  const hit = await call(`/api/notes?q=${encodeURIComponent('KEYWORD-UPDATED')}`);
  assert.equal(hit.status, 200, hit.text);
  assert.equal(hit.json.notes.length, 1);
  assert.equal(hit.json.notes[0].id, ids.note);
  assert.match(hit.json.notes[0].snippet, /KEYWORD-UPDATED/);

  const miss = await call(`/api/notes?q=${encodeURIComponent('絕對找不到的字串-zzz')}`);
  assert.equal(miss.status, 200);
  assert.deepEqual(miss.json.notes, []);

  // 中文搜尋
  const zh = await call(`/api/notes?q=${encodeURIComponent('更新後的內容')}`);
  assert.equal(zh.json.notes.length, 1);
});

test('搜尋：SQL 注入字串不會造成錯誤或資料外洩', async () => {
  for (const payload of ["' OR 1=1 --", "'; DROP TABLE notes; --", "%_\\", "1' UNION SELECT * FROM tags --"]) {
    const res = await call(`/api/notes?q=${encodeURIComponent(payload)}`);
    assert.equal(res.status, 200, `${payload} → ${res.status} ${res.text}`);
    assert.ok(Array.isArray(res.json.notes));
  }
  // 資料表仍在
  const after = await call(`/api/notes/${ids.note}`);
  assert.equal(after.status, 200);
});

test('筆記：建立副本（保留分類與標籤）', async () => {
  await call(`/api/notes/${ids.note}`, { method: 'PATCH', body: { categoryId: ids.category } });
  const res = await call(`/api/notes/${ids.note}/duplicate`, { method: 'POST' });
  assert.equal(res.status, 201, res.text);
  ids.copy = res.json.note.id;
  assert.match(res.json.note.title, /已更新標題 \(副本\)/);
  assert.equal(res.json.note.content, '更新後的內容 with KEYWORD-UPDATED');
  assert.equal(res.json.note.category_id, ids.category);
  assert.equal(res.json.note.tags.length, 1);
  assert.equal(res.json.note.pinned, false, '副本不继承釘選');

  const missing = await call('/api/notes/00000000-0000-4000-8000-000000000000/duplicate', { method: 'POST' });
  assert.equal(missing.status, 404);
});

test('分類：上移／下移改變排序', async () => {
  const a = await call('/api/categories', { method: 'POST', body: { name: uniq('A') } });
  const b = await call('/api/categories', { method: 'POST', body: { name: uniq('B') } });
  ids.catA = a.json.category.id;
  ids.catB = b.json.category.id;

  const before = (await call('/api/categories')).json.categories.map((c) => c.id);
  assert.ok(before.indexOf(ids.catA) < before.indexOf(ids.catB), 'A 應在 B 之前（依建立順序）');

  const up = await call('/api/categories/reorder', { method: 'POST', body: { id: ids.catB, direction: 'up' } });
  assert.equal(up.status, 200, up.text);
  const after = up.json.categories.map((c) => c.id);
  assert.ok(after.indexOf(ids.catB) < after.indexOf(ids.catA), '上移後 B 應在 A 之前');

  const bad = await call('/api/categories/reorder', { method: 'POST', body: { id: ids.catB, direction: 'sideways' } });
  assert.equal(bad.status, 400);
});

test('分類：改名與刪除（其下筆記变成未分類）', async () => {
  const rename = await call(`/api/categories/${ids.catA}`, { method: 'PATCH', body: { name: uniq('改名後'), emoji: '🚀' } });
  assert.equal(rename.status, 200, rename.text);
  assert.equal(rename.json.category.emoji, '🚀');

  // 把筆記放回 ids.category，刪除分類後應变成未分類
  await call(`/api/notes/${ids.note}`, { method: 'PATCH', body: { categoryId: ids.category } });
  const del = await call(`/api/categories/${ids.category}`, { method: 'DELETE' });
  assert.equal(del.status, 200, del.text);
  assert.ok(!del.json.categories.some((c) => c.id === ids.category));

  const note = await call(`/api/notes/${ids.note}`);
  assert.equal(note.json.note.category_id, null);

  assert.equal((await call(`/api/categories/${ids.category}`, { method: 'DELETE' })).status, 404);
});

test('標籤：改名會反映在筆記上；刪除會移除關聯', async () => {
  const newName = uniq('改名標籤');
  const rename = await call(`/api/tags/${ids.tag}`, { method: 'PATCH', body: { name: newName, color: '#e03131' } });
  assert.equal(rename.status, 200, rename.text);
  assert.equal(rename.json.tag.name, newName);

  const note = await call(`/api/notes/${ids.note}`);
  assert.equal(note.json.note.tags[0].name, newName);
  ids.tagName = newName;

  const blank = await call(`/api/tags/${ids.tag}`, { method: 'PATCH', body: { name: '  ' } });
  assert.equal(blank.status, 400);

  const del = await call(`/api/tags/${ids.tag}`, { method: 'DELETE' });
  assert.equal(del.status, 200, del.text);
  assert.ok(!del.json.tags.some((t) => t.id === ids.tag));

  const after = await call(`/api/notes/${ids.note}`);
  assert.deepEqual(after.json.note.tags, []);
});

test('封存：筆記從一般清單消失、出現在封存清單，可還原', async () => {
  const before = await call('/api/bootstrap');
  const baseCount = before.json.archivedCount;

  const archive = await call(`/api/notes/${ids.copy}`, { method: 'PATCH', body: { archived: true } });
  assert.equal(archive.status, 200, archive.text);
  assert.equal(archive.json.note.archived, true);

  const after = await call('/api/bootstrap');
  assert.ok(!after.json.notes.some((n) => n.id === ids.copy), '封存後不應出现在一般清單');
  assert.equal(after.json.archivedCount, baseCount + 1);

  const archivedList = await call('/api/notes?archived=true');
  assert.ok(archivedList.json.notes.some((n) => n.id === ids.copy));

  const restore = await call(`/api/notes/${ids.copy}`, { method: 'PATCH', body: { archived: false } });
  assert.equal(restore.json.note.archived, false);
  const restored = await call('/api/bootstrap');
  assert.ok(restored.json.notes.some((n) => n.id === ids.copy));
});

test('列表篩選：categoryId 與 tagId 參數', async () => {
  const tag = await call('/api/tags', { method: 'POST', body: { name: uniq('篩選用') } });
  ids.filterTag = tag.json.tag.id;
  await call(`/api/notes/${ids.note}`, { method: 'PATCH', body: { tagNames: [tag.json.tag.name] } });

  const byTag = await call(`/api/notes?tagId=${ids.filterTag}`);
  assert.equal(byTag.json.notes.length, 1);
  assert.equal(byTag.json.notes[0].id, ids.note);

  const byTagEmpty = await call(`/api/notes?tagId=${ids.tag || '00000000-0000-4000-8000-000000000000'}`);
  assert.ok(Array.isArray(byTagEmpty.json.notes));

  const byCat = await call(`/api/notes?categoryId=${ids.catB}`);
  assert.deepEqual(byCat.json.notes, []);
});

test('XSS：內文原樣儲存（過濾在渲染層），且 API 不會執行任何內容', async () => {
  const payload = `<script>window.__pwned = true</script><img src=x onerror="alert(1)"><iframe src="javascript:alert(2)"></iframe>`;
  const res = await call('/api/notes', { method: 'POST', body: { title: 'XSS 測試', content: payload } });
  assert.equal(res.status, 201, res.text);
  ids.xss = res.json.note.id;
  const read = await call(`/api/notes/${ids.xss}`);
  assert.equal(read.json.note.content, payload, '伺服器不竄改內容；sanitize 由前端渲染層處理');
  // API 一律回 JSON，瀏覽器不會把它當 HTML 執行
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  assert.match(read.headers.get('content-type') || '', /application\/json/);
});

test('請求格式：非 JSON body 回 400', async () => {
  const res = await fetch(`${BASE}/api/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: '{ this is not json',
  });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test('登出：cookie 失效後 API 回 401', async () => {
  const res = await call('/api/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  const after = await call('/api/bootstrap');
  assert.equal(after.status, 401);
});

test('清理：刪除測試期間建立的資料', async () => {
  const login = await call('/api/auth/login', { method: 'POST', body: { password: PASSWORD } });
  assert.equal(login.status, 200, login.text);

  for (const noteId of [ids.note, ids.copy, ids.xss]) {
    if (noteId) assert.equal((await call(`/api/notes/${noteId}`, { method: 'DELETE' })).status, 200);
  }
  for (const catId of [ids.catA, ids.catB]) {
    if (catId) await call(`/api/categories/${catId}`, { method: 'DELETE' });
  }
  for (const tagId of [ids.filterTag]) {
    if (tagId) await call(`/api/tags/${tagId}`, { method: 'DELETE' });
  }

  // 測試標籤可能已在前面的案例中刪除
  const remaining = await call('/api/bootstrap');
  assert.equal(remaining.status, 200);
  assert.ok(!remaining.json.notes.some((n) => [ids.note, ids.copy, ids.xss].includes(n.id)));
  await call('/api/auth/logout', { method: 'POST' });
});

test('登入限流：連續錯誤密碼後回 429', { skip: process.env.SKIP_RATE_LIMIT === '1' ? '略過' : false }, async () => {
  let blocked = null;
  for (let i = 0; i < 16; i += 1) {
    const res = await call('/api/auth/login', { method: 'POST', body: { password: 'nope' }, useCookie: false });
    if (res.status === 429) {
      blocked = res;
      break;
    }
    assert.equal(res.status, 401, `第 ${i + 1} 次應為 401，實際 ${res.status}`);
  }
  assert.ok(blocked, '連續錯誤登入應觸發 429');
  assert.ok(blocked.json.retryAfter > 0);
  assert.match(blocked.json.error, /登入嘗試次數過多/);
});
