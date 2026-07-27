import assert from 'node:assert/strict';
import test from 'node:test';
import { cookiesForLoginClient, cookiesForLoginStore } from '../server/utils/login-cookie.ts';

test('扫码各阶段 Cookie 会合并写入会话，并排除内部和临时 Cookie', () => {
  const cookies = cookiesForLoginStore('uuid=scan-id; ticket=from-scan; auth-key=internal', [
    'ticket=from-login; Path=/',
    'slave_sid=session; HttpOnly',
  ]);

  assert.deepEqual(cookies, ['ticket=from-login; Path=/', 'slave_sid=session; HttpOnly']);
});

test('透传扫码 Cookie 时移除上游 Domain 并绑定当前站点根路径', () => {
  const cookies = cookiesForLoginClient(['uuid=scan-id; Domain=.weixin.qq.com; Path=/cgi-bin; Secure; HttpOnly']);

  assert.deepEqual(cookies, ['uuid=scan-id; Path=/; Secure; HttpOnly']);
});
