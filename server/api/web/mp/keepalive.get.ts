import { getTokenFromStore } from '~/server/utils/CookieStore';
import { getMpSessionTtlSeconds } from '~/server/utils/mp-session';
import { proxyMpRequest } from '~/server/utils/proxy-request';

/**
 * 刷新微信公众号后台会话。
 * 私有部署可通过 cron 定时携带 X-Auth-Key 调用该接口。
 */
export default defineEventHandler(async event => {
  const token = await getTokenFromStore(event);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: '未登录或登录已过期，请重新扫码登录' });
  }

  const response: Response = await proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/home',
    query: {
      t: 'home/index',
      token,
      lang: 'zh_CN',
    },
  });
  const html = await response.text();
  const sessionValid = /wx\.cgiData\.nick_name\s*?=/.test(html);

  if (!sessionValid) {
    throw createError({ statusCode: 401, statusMessage: '微信后台会话已失效，请重新扫码登录' });
  }

  const headers = new Headers({ 'Content-Type': 'application/json; charset=UTF-8' });
  for (const cookie of response.headers.getSetCookie()) {
    headers.append('Set-Cookie', cookie);
  }

  const runtimeConfig = useRuntimeConfig(event);
  return new Response(
    JSON.stringify({
      ok: true,
      refreshedAt: new Date().toISOString(),
      expiresIn: getMpSessionTtlSeconds(runtimeConfig.mpSessionTtlDays),
    }),
    { status: 200, headers }
  );
});
