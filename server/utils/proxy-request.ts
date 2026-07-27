import dayjs from 'dayjs';
import { H3Event, parseCookies } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { isDev, USER_AGENT } from '~/config';
import type { RequestOptions } from '~/server/types';
import { cookieStore, getCookieFromStore } from '~/server/utils/CookieStore';
import { logRequest, logResponse } from '~/server/utils/logger';
import { cookiesForLoginClient, cookiesForLoginStore } from '~/server/utils/login-cookie';
import { createAuthKeyCookie, getMpSessionTtlSeconds, resolveMpAuthKey } from '~/server/utils/mp-session';

/**
 * 代理微信公众号请求
 * @description 登录时保存完整 cookie，后续成功请求合并微信新下发的 cookie 并滑动续期
 * @param options 请求参数
 */
export async function proxyMpRequest(options: RequestOptions) {
  const runtimeConfig = useRuntimeConfig();
  const sessionTtlSeconds = getMpSessionTtlSeconds(runtimeConfig.mpSessionTtlDays);

  const headers = new Headers({
    Referer: 'https://mp.weixin.qq.com/',
    Origin: 'https://mp.weixin.qq.com',
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'identity', // 禁用压缩，避免出现response.clone() bug
  });

  // 登录流程会显式传入 uuid cookie；其余请求才从 CookieStore 读取后台会话。
  const storedCookie = options.cookie ? null : await getCookieFromStore(options.event);
  const cookie: string | null = options.cookie || storedCookie;
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const requestInit: RequestInit = {
    method: options.method,
    headers: headers,
    redirect: options.redirect || 'follow',
  };

  // 处理参数
  if (options.query) {
    options.endpoint += '?' + new URLSearchParams(options.query as Record<string, string>).toString();
  }
  if (options.method === 'POST' && options.body) {
    requestInit.body = new URLSearchParams(options.body as Record<string, string>).toString();
  }

  // 构造请求
  const request = new Request(options.endpoint, requestInit);

  // 记录请求报文
  const requestId = uuidv4().replace(/-/g, '');
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logRequest(requestId, request.clone());
  }

  // 转发请求
  const mpResponse = await fetch(request);

  // 记录响应报文
  if (process.env.NUXT_DEBUG_MP_REQUEST && isDev) {
    await logResponse(requestId, mpResponse.clone());
  }

  let setCookies: string[] = [];

  // 扫码登录的每一步都可能刷新 Cookie。改写 Domain 后透传给浏览器，
  // 使下一步请求携带同一份完整 Cookie jar。
  if (options.action === 'start_login' || options.action === 'continue_login') {
    setCookies = cookiesForLoginClient(mpResponse.headers.getSetCookie());
  }

  // 处理登录成功请求的 cookie
  // 只有登录请求才会将 Cookie 数据写入 CookieStore
  // 返回给客户端的一个 auth-key 的 cookie
  else if (options.action === 'login') {
    // 提取出 token 和 cookies
    try {
      const authKey = resolveMpAuthKey(
        runtimeConfig.mpStableAuthKey,
        getAuthKeyFromRequest(options.event),
        crypto.randomUUID().replace(/-/g, '')
      );

      const body = await mpResponse.clone().json();
      const redirectUrl = body?.redirect_url;
      if (!redirectUrl || typeof redirectUrl !== 'string') {
        throw new Error(`登录响应中未找到 redirect_url，响应内容: ${JSON.stringify(body)}`);
      }

      const token = new URL(`http://localhost${redirectUrl}`).searchParams.get('token');
      if (!token) {
        throw new Error(`redirect_url 中未找到 token 参数: ${redirectUrl}`);
      }

      const loginCookies = cookiesForLoginStore(cookie || '', mpResponse.headers.getSetCookie());
      const success = await cookieStore.setCookie(authKey, token, loginCookies, sessionTtlSeconds);
      if (!success) {
        throw new Error('cookie 写入 KV 存储失败');
      }
      console.log('cookie 写入成功');

      setCookies = [
        createAuthKeyCookie(authKey, sessionTtlSeconds),

        // 登录成功后，删除浏览器的 uuid cookie
        `uuid=EXPIRED; Path=/; Expires=${dayjs().subtract(1, 'days').toString()}; Secure; HttpOnly`,
      ];
    } catch (error) {
      console.error('action(login) failed:', error);

      // 登录失败时返回错误响应，而不是静默继续
      return new Response(JSON.stringify({ base_resp: { ret: -1, err_msg: `登录处理失败: ${error}` } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 处理切换公众号的请求
  else if (options.action === 'switch_account') {
    const authKey = getAuthKeyFromRequest(options.event);
    if (authKey) {
      setCookies.push('switch_account=1');
    }
  }

  // 普通后台请求成功后，合并微信新下发的 cookie，并重新写入 KV 实现滑动续期。
  const requestPath = new URL(request.url).pathname;
  const shouldRefreshSession =
    storedCookie &&
    options.action !== 'start_login' &&
    options.action !== 'login' &&
    requestPath !== '/cgi-bin/logout' &&
    !(await mpSessionIsExpired(mpResponse, options.parseJson));
  if (shouldRefreshSession) {
    const authKey = getAuthKeyFromRequest(options.event);
    if (authKey) {
      const success = await cookieStore.updateCookie(authKey, mpResponse.headers.getSetCookie(), sessionTtlSeconds);
      if (success) {
        setCookies.push(createAuthKeyCookie(authKey, sessionTtlSeconds));
      }
    }
  }

  // 构造返回给客户端的响应
  const responseHeaders = new Headers(mpResponse.headers);
  responseHeaders.delete('set-cookie');
  setCookies.forEach(setCookie => {
    responseHeaders.append('set-cookie', setCookie);
  });

  const finalResponse = new Response(mpResponse.body, {
    status: mpResponse.status,
    statusText: mpResponse.statusText,
    headers: responseHeaders,
  });

  if (!options.parseJson) {
    return finalResponse;
  } else {
    return finalResponse.json();
  }
}

export function getAuthKeyFromRequest(event: H3Event): string {
  let authKey = getRequestHeader(event, 'X-Auth-Key');
  if (!authKey) {
    const cookies = parseCookies(event);
    authKey = cookies['auth-key'];
  }

  return authKey;
}

async function mpSessionIsExpired(response: Response, parseJson = false): Promise<boolean> {
  if (!response.ok) {
    return true;
  }

  const responseUrl = response.url.toLowerCase();
  if (responseUrl.includes('/cgi-bin/loginpage') || responseUrl.includes('t=wxm-login')) {
    return true;
  }

  if (parseJson) {
    try {
      const body = await response.clone().json();
      const ret = body?.base_resp?.ret ?? body?.ret;
      return ret === 200003;
    } catch {
      return false;
    }
  }

  return false;
}
