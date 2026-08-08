import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthKeyCookie,
  DEFAULT_MP_SESSION_TTL_SECONDS,
  getMpSessionTtlSeconds,
  resolveMpAuthKey,
  SECONDS_PER_DAY,
} from '../server/utils/mp-session.ts';

test('会话 TTL 默认 3 天，并接受正整数覆盖', () => {
  assert.equal(getMpSessionTtlSeconds(undefined), DEFAULT_MP_SESSION_TTL_SECONDS);
  assert.equal(DEFAULT_MP_SESSION_TTL_SECONDS, 3 * SECONDS_PER_DAY);
  assert.equal(getMpSessionTtlSeconds('30'), 30 * SECONDS_PER_DAY);
  assert.equal(getMpSessionTtlSeconds('invalid'), DEFAULT_MP_SESSION_TTL_SECONDS);
});

test('auth-key cookie 具备持久化和安全属性', () => {
  const cookie = createAuthKeyCookie('a'.repeat(32), SECONDS_PER_DAY);
  assert.match(cookie, /Max-Age=86400/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('固定 auth-key 优先，其次复用现有 key', () => {
  const configured = 'c'.repeat(32);
  const existing = 'e'.repeat(32);
  const fallback = 'f'.repeat(32);

  assert.equal(resolveMpAuthKey(configured, existing, fallback), configured);
  assert.equal(resolveMpAuthKey('', existing, fallback), existing);
  assert.equal(resolveMpAuthKey('bad;key', 'short', fallback), fallback);
});
