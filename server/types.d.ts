import { H3Event } from 'h3';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  event: H3Event;
  endpoint: string;
  method: Method;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, string | number | undefined>;
  parseJson?: boolean;
  cookie?: string;
  referer?: string;
  redirect?: RequestRedirect;

  /**
   * start_login: 开始登录流程并把微信 Cookie 传递给客户端
   * continue_login: 继续扫码流程并累积微信 Cookie
   * login: 登录流程完成 (把微信原始响应中的所有 set-cookie 存储在 CookieStore 中，并返回给客户端一个唯一的cookie: auth-key=xxx)
   * switch_account: 切换公众号
   */
  action?: 'start_login' | 'continue_login' | 'login' | 'switch_account';
}
