import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFileName, cleanMime, guessMime, isInlineSafe, mediaKind } from '../../lib/file-utils.js';
import { formatBytes } from '../../lib/format.js';

test('cleanFileName：移除路徑分隔線與控制字元', () => {
  assert.equal(cleanFileName('../../etc/passwd'), '.._.._etc_passwd');
  assert.equal(cleanFileName('a\u0000b.txt'), 'ab.txt');
  assert.equal(cleanFileName('   '), '未命名檔案');
  assert.equal(cleanFileName('照片 01.png'), '照片 01.png');
});

test('cleanMime：只接受合法型別字串', () => {
  assert.equal(cleanMime('image/png'), 'image/png');
  assert.equal(cleanMime('IMAGE/JPEG'), 'image/jpeg');
  assert.equal(cleanMime('not a mime'), 'application/octet-stream');
  assert.equal(cleanMime(''), 'application/octet-stream');
  assert.equal(cleanMime('text/html; charset=utf-8'), 'application/octet-stream');
});

test('guessMime：依副檔名推測', () => {
  assert.equal(guessMime('a.PNG'), 'image/png');
  assert.equal(guessMime('clip.mp4'), 'video/mp4');
  assert.equal(guessMime('song.m4a'), 'audio/mp4');
  assert.equal(guessMime('report.pdf'), 'application/pdf');
  assert.equal(guessMime('unknown.xyz'), 'application/octet-stream');
});

test('isInlineSafe：SVG 與 HTML 必須強制下載', () => {
  assert.equal(isInlineSafe('image/png'), true);
  assert.equal(isInlineSafe('image/svg+xml'), false);
  assert.equal(isInlineSafe('text/html'), false);
  assert.equal(isInlineSafe('application/pdf'), true);
  assert.equal(isInlineSafe('application/zip'), false);
});

test('mediaKind：分類圖示與預覽方式', () => {
  assert.equal(mediaKind('image/jpeg'), 'image');
  assert.equal(mediaKind('audio/mpeg'), 'audio');
  assert.equal(mediaKind('video/webm'), 'video');
  assert.equal(mediaKind('application/pdf'), 'pdf');
  assert.equal(mediaKind('text/markdown'), 'text');
  assert.equal(mediaKind('', 'note.md'), 'text');
  assert.equal(mediaKind('application/zip'), 'other');
});

test('formatBytes：大小格式化', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});