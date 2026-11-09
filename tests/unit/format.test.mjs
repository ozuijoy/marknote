import test from 'node:test';
import assert from 'node:assert/strict';
import { colorFor, countWords, formatDate, formatDateTime, readingTime, relativeTime } from '../../lib/format.js';

const NOW = new Date('2026-11-08T12:00:00Z').getTime();

test('relativeTime：各種時間間距', () => {
  const at = (ms) => new Date(NOW - ms).toISOString();
  assert.equal(relativeTime(at(10_000), NOW), '剛剛');
  assert.equal(relativeTime(at(5 * 60_000), NOW), '5 分鐘前');
  assert.equal(relativeTime(at(3 * 3600_000), NOW), '3 小時前');
  assert.equal(relativeTime(at(26 * 3600_000), NOW), '昨天');
  assert.equal(relativeTime(at(3 * 86400_000), NOW), '3 天前');
  assert.equal(relativeTime(at(30 * 86400_000), NOW), formatDate(at(30 * 86400_000)));
  assert.equal(relativeTime(null, NOW), '');
  assert.equal(relativeTime('not-a-date', NOW), '');
});

test('relativeTime：未來時間顯示完整日期', () => {
  const future = new Date(NOW + 86400_000).toISOString();
  assert.equal(relativeTime(future, NOW), formatDateTime(future));
});

test('countWords：中文以字計、英文以單字計', () => {
  assert.deepEqual(countWords(''), { chars: 0, words: 0 });
  assert.equal(countWords('你好世界').words, 4);
  assert.equal(countWords('hello world foo').words, 3);
  assert.equal(countWords('你好 world').words, 3);
  assert.equal(countWords('   ').words, 0);
});

test('readingTime：至少 1 分鐘', () => {
  assert.equal(readingTime(''), 1);
  assert.equal(readingTime('字'.repeat(900)), 3);
});

test('colorFor：同一名稱穩定取色、不同名稱可分散', () => {
  const a = colorFor('工作');
  const b = colorFor('工作');
  assert.deepEqual(a, b);
  assert.ok(a.bg && a.fg);
  const colors = new Set(['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8'].map((n) => colorFor(n).fg));
  assert.ok(colors.size >= 3, '不同標籤應能取到多種顏色');
  assert.deepEqual(colorFor(''), colorFor(''));
});

test('formatDate：同年省略年份', () => {
  const thisYear = new Date().getFullYear();
  assert.equal(formatDate(`${thisYear}-03-05T10:00:00Z`), '03/05');
  assert.equal(formatDate('2001-03-05T10:00:00Z'), '2001/03/05');
  assert.equal(formatDate(null), '');
});
