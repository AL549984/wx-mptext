import { H3Event, parseCookies } from 'h3';
import { deleteMpCookie, getMpCookie, setMpCookie } from '~/server/kv/cookie';
import { AccountCookie } from '~/server/utils/AccountCookie';

// 所有用户的 cookie 仓库
class CookieStore {
  // key 为 authKey, value 为 AccountCookie 实例
  // 使用 Map 的插入顺序特性实现 LRU 淘汰
  store: Map<string, AccountCookie> = new Map<string, AccountCookie>();

  // 内存缓存最大条目数，防止无限增长
  private readonly maxSize: number = 1000;

  async getAccountCookie(authKey: string): Promise<AccountCookie | null> {
    // 优先从本地内存取
    let cachedAccountCookie = this.store.get(authKey);

    if (cachedAccountCookie) {
      // LRU: 访问时将条目移到末尾（最近使用）
      this.store.delete(authKey);
      this.store.set(authKey, cachedAccountCookie);
      return cachedAccountCookie;
    }

    // 如果内存没有，则从 kv 数据库取
    const cookieValue = await getMpCookie(authKey);
    if (!cookieValue) {
      return null;
    }

    cachedAccountCookie = AccountCookie.create(cookieValue.token, cookieValue.cookies);
    this.evictIfNeeded();
    this.store.set(authKey, cachedAccountCookie);

    return cachedAccountCookie;
  }

  /**
   * 检索用户的cookie
   * @param authKey
   * @return 适合作为请求头的Cookie字符串
   */
  async getCookie(authKey: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return null;
    }
    return accountCookie.toString();
  }

  /**
   * 存储用户的cookie
   * @param authKey
   * @param token
   * @param cookie 原始的 set-cookie 字符串数组
   */
  async setCookie(authKey: string, token: string, cookie: string[], expirationTtl?: number): Promise<boolean> {
    const accountCookie = new AccountCookie(token, cookie);
    // 如果已存在则先删除（保证 LRU 顺序正确）
    this.store.delete(authKey);
    this.evictIfNeeded();
    this.store.set(authKey, accountCookie);
    return await setMpCookie(authKey, accountCookie.toJSON(), expirationTtl);
  }

  /**
   * 合并微信最新下发的 cookie，并重新写入 KV 以滑动续期。
   */
  async updateCookie(authKey: string, cookies: string[], expirationTtl?: number): Promise<boolean> {
    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return false;
    }

    accountCookie.merge(cookies);
    if (accountCookie.isExpired) {
      await this.removeCookie(authKey);
      return false;
    }

    return await setMpCookie(authKey, accountCookie.toJSON(), expirationTtl);
  }

  /**
   * 移除用户的 cookie（用于登出等场景）
   * @param authKey
   */
  async removeCookie(authKey: string): Promise<void> {
    this.store.delete(authKey);
    await deleteMpCookie(authKey);
  }

  /**
   * 当内存缓存达到上限时，淘汰最久未使用的条目
   */
  private evictIfNeeded(): void {
    while (this.store.size >= this.maxSize) {
      // Map 迭代器按插入顺序返回，第一个即为最久未使用
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  /**
   * 检索用户的 token
   * @param authKey
   */
  async getToken(authKey: string): Promise<string | null> {
    const accountCookie = await this.getAccountCookie(authKey);
    if (!accountCookie) {
      return null;
    }

    return accountCookie.token;
  }

  /**
   * 转换为 json 格式，方便存储与传输
   * 返回一个对象，键为 uuid，值为解析后的 cookie 对象
   */
  toJSON(): Record<string, AccountCookie> {
    const json: Record<string, AccountCookie> = {};
    for (const [authKey, accountCookie] of this.store) {
      json[authKey] = accountCookie;
    }
    return json;
  }
}

export const cookieStore = new CookieStore();

/**
 * 从 CookieStore 中获取 cookie 字符串
 *
 * @description 根据请求中的 X-Auth-Key header 或者 auth-key cookie，从 CookieStore 中检索用户登录信息的 cookie，这些 cookie 会透传给微信
 * @param event
 */
export async function getCookieFromStore(event: H3Event): Promise<string | null> {
  let cookie: string | null = null;

  // 优先根据自定义的 X-Auth-Key 检索
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (authKey) {
    cookie = await cookieStore.getCookie(authKey);
    if (cookie) {
      return cookie;
    }
  }

  // 从 cookie 中的 token 检索
  const cookies = parseCookies(event);
  authKey = cookies['auth-key'];
  if (authKey) {
    cookie = await cookieStore.getCookie(authKey);
    if (cookie) {
      return cookie;
    }
  }

  return null;
}

/**
 * 从 CookieStore 中获取公众号的 token
 *
 * @description 根据请求中的 X-Auth-Key header 或者 auth-key cookie，从 CookieStore 中检索用户登录时绑定的 token
 * @param event
 */
export async function getTokenFromStore(event: H3Event): Promise<string | null> {
  let token: string | null = null;

  // 优先根据自定义的 X-Auth-Key 检索
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (authKey) {
    token = await cookieStore.getToken(authKey);
    if (token) {
      return token;
    }
  }

  // 从 cookie 中的 token 检索
  const cookies = parseCookies(event);
  authKey = cookies['auth-key'];
  if (authKey) {
    token = await cookieStore.getToken(authKey);
    if (token) {
      return token;
    }
  }

  return null;
}

/**
 * 从请求中获取 cookie 字符串
 *
 * @description 用于登录过程中 uuid cookie 透传给微信
 * @param event
 */
export function getCookiesFromRequest(event: H3Event): string {
  const cookies = parseCookies(event);
  return Object.keys(cookies)
    .map(key => `${key}=${encodeURIComponent(cookies[key])}`)
    .join(';');
}

/**
 * 从 response 中获取指定的 set-cookie 的 value 部分
 * @param name cookie 名
 * @param response
 */
export function getCookieFromResponse(name: string, response: Response): string | null {
  const cookies = AccountCookie.parse(response.headers.getSetCookie());
  const targetCookie = cookies.find(cookie => cookie.name === name);
  if (targetCookie) {
    return targetCookie.value as string;
  }
  return null;
}
