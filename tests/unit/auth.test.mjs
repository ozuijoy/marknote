import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitLogin, resetLoginAttempts, verifyPassword } from '../../lib/auth.js';

test('verifyPassword：正確與錯誤密碼', async () => {
  assert.equal(await verifyPassword('s3cret-pass', 's3cret-pass'), true);
  assert.equal(await verifyPassword('wrong', 's3cret-pass'), false);
  assert.equal(await verifyPassword('', 's3cret-pass'), false);
  assert.equal(await verifyPassword('s3cret-pass', ''), false);
  assert.equal(await verifyPassword(undefined, 'x'), false);
  assert.equal(await verifyPassword('中文密碼', '中文密碼'), true);
});

test('verifyPassword：長度不同也不洩漏', async () => {
  assert.equal(await verifyPassword('short', 'muchlongerpassword'), false);
});

test('rateLimitLogin：超過次數上限後封鎖，並可重設', () => {
  resetLoginAttempts('unit-test');
  for (let i = 0; i < 12; i += 1) {
    assert.equal(rateLimitLogin('unit-test').allowed, true, `第 ${i + 1} 次應允許`);
  }
  const blocked = rateLimitLogin('unit-test');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 900);

  resetLoginAttempts('unit-test');
  assert.equal(rateLimitLogin('unit-test').allowed, true);
  resetLoginAttempts('unit-test');
});
