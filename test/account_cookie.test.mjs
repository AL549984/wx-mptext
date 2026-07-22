import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountCookie } from '../server/utils/AccountCookie.ts';

test('保留 cookie 值中的等号', () => {
  const accountCookie = new AccountCookie('token', ['session=abc==; Path=/; HttpOnly']);
  assert.equal(accountCookie.get('session')?.value, 'abc==');
  assert.equal(accountCookie.toString(), 'session=abc==');
});

test('合并新 cookie，同时保留未更新的 cookie', () => {
  const accountCookie = new AccountCookie('token', ['session=old; Path=/', 'token=keep; Path=/']);
  accountCookie.merge(['session=new; Path=/']);

  assert.equal(accountCookie.toString(), 'session=new; token=keep');
});

test('微信删除 cookie 后不再发送该 cookie', () => {
  const accountCookie = new AccountCookie('token', ['session=old; Path=/', 'token=keep; Path=/']);
  accountCookie.merge(['session=EXPIRED; Max-Age=0; Path=/']);

  assert.equal(accountCookie.get('session'), undefined);
  assert.equal(accountCookie.toString(), 'token=keep');
});

test('已过期 cookie 不会被序列化', () => {
  const accountCookie = new AccountCookie('token', [
    'expired=value; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'active=value; Path=/',
  ]);

  assert.deepEqual(
    accountCookie.toJSON().cookies.map(cookie => cookie.name),
    ['active']
  );
});
