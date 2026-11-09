import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  buildSanitizeSchema,
  classifyMediaUrl,
  excerptOf,
  extractMediaUrls,
  extensionOf,
  isAllowedEmbedHost,
  isSafeMediaUrl,
  resolveEmbed,
} from '../../lib/media.js';

const EMBED_HOSTS = [
  'www.youtube.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'player.bilibili.com',
  'bilibili.com',
];

test('classifyMediaUrl：依副檔名辨識媒體類型', () => {
  assert.equal(classifyMediaUrl('https://cdn.example.com/a/photo.PNG'), 'image');
  assert.equal(classifyMediaUrl('https://cdn.example.com/a/song.mp3?token=1#t=10'), 'audio');
  assert.equal(classifyMediaUrl('https://cdn.example.com/a/clip.mp4'), 'video');
  assert.equal(classifyMediaUrl('https://cdn.example.com/a/clip.webm'), 'video');
  assert.equal(classifyMediaUrl('https://example.com/page'), null);
  assert.equal(classifyMediaUrl('https://example.com/app.js'), null);
  assert.equal(classifyMediaUrl('javascript:alert(1)'), null);
  assert.equal(classifyMediaUrl(''), null);
  assert.equal(classifyMediaUrl(null), null);
});

test('classifyMediaUrl：所有支援的副檔名都能辨識', () => {
  for (const ext of IMAGE_EXTENSIONS) assert.equal(classifyMediaUrl(`https://x.test/a.${ext}`), 'image', ext);
  for (const ext of AUDIO_EXTENSIONS) assert.equal(classifyMediaUrl(`https://x.test/a.${ext}`), 'audio', ext);
  for (const ext of VIDEO_EXTENSIONS) assert.equal(classifyMediaUrl(`https://x.test/a.${ext}`), 'video', ext);
});

test('classifyMediaUrl：影音平台連結視為 embed', () => {
  assert.equal(classifyMediaUrl('https://www.youtube.com/watch?v=abc123', EMBED_HOSTS), 'embed');
  assert.equal(classifyMediaUrl('https://vimeo.com/76979871', EMBED_HOSTS), 'embed');
  assert.equal(classifyMediaUrl('https://example.com/watch?v=abc', EMBED_HOSTS), null);
});

test('resolveEmbed：YouTube 各種網址型式', () => {
  const cases = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1',
  ];
  for (const url of cases) {
    const embed = resolveEmbed(url, EMBED_HOSTS);
    assert.ok(embed, `應可解析：${url}`);
    assert.equal(embed.provider, 'youtube');
    assert.equal(embed.id, 'dQw4w9WgXcQ');
    assert.equal(embed.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1');
  }
});

test('resolveEmbed：YouTube 起始時間參數', () => {
  const embed = resolveEmbed('https://youtu.be/abc123?t=95', EMBED_HOSTS);
  assert.match(embed.src, /start=95/);
});

test('resolveEmbed：Vimeo 與 Bilibili', () => {
  const vimeo = resolveEmbed('https://vimeo.com/76979871', EMBED_HOSTS);
  assert.equal(vimeo.src, 'https://player.vimeo.com/video/76979871');

  const bili = resolveEmbed('https://www.bilibili.com/video/BV1GJ411x7h7?p=2', EMBED_HOSTS);
  assert.equal(bili.provider, 'bilibili');
  assert.match(bili.src, /^https:\/\/player\.bilibili\.com\/player\.html\?bvid=BV1GJ411x7h7&page=2/);
});

test('resolveEmbed：白名單外的網域一律不内嵌', () => {
  assert.equal(resolveEmbed('https://www.youtube.com/watch?v=abc', []), null);
  assert.equal(resolveEmbed('https://www.youtube.com/watch?v=abc', ['vimeo.com']), null);
  assert.equal(resolveEmbed('https://evil.test/watch?v=abc', EMBED_HOSTS), null);
  assert.equal(resolveEmbed('https://youtube.com.evil.test/watch?v=abc', EMBED_HOSTS), null);
});

test('resolveEmbed：只允許 player.vimeo.com 時仍可解析', () => {
  assert.ok(resolveEmbed('https://vimeo.com/123', ['player.vimeo.com']));
});

test('isSafeMediaUrl：阻擋 javascript:／data: 攻擊向量', () => {
  assert.equal(isSafeMediaUrl('https://x.test/a.mp4'), true);
  assert.equal(isSafeMediaUrl('http://x.test/a.mp4'), true);
  assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
  assert.equal(isSafeMediaUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeMediaUrl('data:image/png;base64,AAA'), false);
  assert.equal(isSafeMediaUrl('data:image/png;base64,AAA', { allowDataImage: true }), true);
  assert.equal(isSafeMediaUrl('  '), false);
  assert.equal(isSafeMediaUrl(undefined), false);
});

test('isAllowedEmbedHost：只放行 https 且符合白名單', () => {
  assert.equal(isAllowedEmbedHost('https://www.youtube.com/embed/x', ['youtube.com']), true);
  assert.equal(isAllowedEmbedHost('https://player.bilibili.com/player.html', ['bilibili.com']), true);
  assert.equal(isAllowedEmbedHost('https://evil.test/x', ['youtube.com']), false);
  assert.equal(isAllowedEmbedHost('http://www.youtube.com/embed/x', ['youtube.com']), false);
  assert.equal(isAllowedEmbedHost('https://notyoutube.com/embed/x', ['youtube.com']), false);
  assert.equal(isAllowedEmbedHost('https://www.youtube.com/embed/x', []), false);
});

test('extensionOf：忽略 query 與 hash', () => {
  assert.equal(extensionOf('https://x.test/a/b.MP3?v=2#x'), 'mp3');
  assert.equal(extensionOf('https://x.test/noext'), '');
});

test('excerptOf：去除 Markdown 語法並截斷', () => {
  assert.equal(excerptOf('# 標題\n\n**粗體** 與 [連結](https://x.test) 與 `code`'), '標題 粗體 與 連結 與');
  assert.equal(excerptOf('![img](https://x.test/a.png) 文字'), '文字');
  assert.equal(excerptOf('很長'.repeat(200), 10).length, 11); // 10 字 + 省略號
  assert.equal(excerptOf(''), '');
});

test('extractMediaUrls：抓到 Markdown／HTML／裸網址', () => {
  const md = [
    '![圖](https://x.test/a.png)',
    '<video src="https://x.test/v.mp4" controls></video>',
    '<audio src="https://x.test/s.mp3"></audio>',
    '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
    '裸連結 https://x.test/b.jpg 結束',
    '([括號內](https://x.test/c.png))',
  ].join('\n');
  const urls = extractMediaUrls(md);
  for (const expected of [
    'https://x.test/a.png',
    'https://x.test/v.mp4',
    'https://x.test/s.mp3',
    'https://www.youtube.com/embed/abc',
    'https://x.test/b.jpg',
    'https://x.test/c.png',
  ]) {
    assert.ok(urls.includes(expected), `應包含 ${expected}，實際：${JSON.stringify(urls)}`);
  }
  assert.ok(!urls.includes('('), '不應抓到括號');
});

test('extractMediaUrls：空內容回傳空陣列', () => {
  assert.deepEqual(extractMediaUrls(''), []);
  assert.deepEqual(extractMediaUrls(null), []);
});

test('buildSanitizeSchema：放行媒體標籤、擋下 script 與事件屬性', () => {
  const schema = buildSanitizeSchema();
  for (const tag of ['img', 'audio', 'video', 'source', 'track', 'iframe', 'figure', 'input']) {
    assert.ok(schema.tagNames.includes(tag), `應放行 <${tag}>`);
  }
  assert.ok(!schema.tagNames.includes('script'), '不應放行 <script>');
  assert.ok(!schema.tagNames.includes('style'), '不應放行 <style>');

  const globalAttrs = schema.attributes['*'] || [];
  assert.ok(!globalAttrs.some((a) => String(a).startsWith('on')), '不應放行 on* 事件屬性');
  assert.deepEqual(schema.attributes.audio.includes('src') && true, true);
  assert.ok(schema.attributes.video.includes('controls'));
  assert.ok(schema.attributes.iframe.includes('allowFullScreen'));
  assert.ok(schema.attributes.input.includes('checked'), 'GFM 待辦清單需要 checked');
  assert.deepEqual(schema.protocols.src, ['http', 'https']);
  assert.equal(schema.allowComments, false);
});
