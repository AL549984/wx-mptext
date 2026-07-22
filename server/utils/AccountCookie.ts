// 表示一条 set-cookie 记录的解析结果
export type CookieEntity = Record<string, string | number>;

// 公众号所有的 set-cookie 解析结果
export class AccountCookie {
  private readonly _token: string;
  private _cookie: CookieEntity[];

  /**
   * @param token
   * @param cookies response.headers.getSetCookie() 的结果，是一个字符串数组
   */
  constructor(token: string, cookies: string[]) {
    this._token = token;
    this._cookie = AccountCookie.parse(cookies);
  }

  static create(token: string, cookies: CookieEntity[]): AccountCookie {
    const value = new AccountCookie(token, []);
    value._cookie = cookies;
    return value;
  }

  public toString(): string {
    return this._cookie
      .filter(cookie => !AccountCookie.isExpired(cookie))
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  public toJSON(): { token: string; cookies: CookieEntity[] } {
    return {
      token: this._token,
      cookies: this._cookie.filter(cookie => !AccountCookie.isExpired(cookie)),
    };
  }

  public get(name: string): CookieEntity | undefined {
    const cookie = this._cookie.find(cookie => cookie.name === name);
    return cookie && !AccountCookie.isExpired(cookie) ? cookie : undefined;
  }

  public get token() {
    return this._token;
  }

  public get isExpired(): boolean {
    return this._cookie.every(cookie => AccountCookie.isExpired(cookie));
  }

  public merge(cookies: string[]): void {
    const cookieMap = new Map<string, CookieEntity>();
    for (const cookie of this._cookie) {
      if (!AccountCookie.isExpired(cookie)) {
        cookieMap.set(cookie.name as string, cookie);
      }
    }

    for (const cookie of AccountCookie.parse(cookies)) {
      const name = cookie.name as string;
      if (AccountCookie.isExpired(cookie)) {
        cookieMap.delete(name);
      } else {
        cookieMap.set(name, cookie);
      }
    }

    this._cookie = Array.from(cookieMap.values());
  }

  public static parse(cookies: string[]): CookieEntity[] {
    // key 为 cookie 的 name
    const cookieMap = new Map<string, CookieEntity>();

    for (const cookie of cookies) {
      const cookieObj: CookieEntity = {};
      // 分割 cookie 字符串为各个属性
      const parts = cookie.split(';').map(str => str.trim());

      // 第一个部分是name=value
      const [nameValue] = parts;
      if (nameValue) {
        const [name, ...valueParts] = nameValue.split('=');
        const cookieName = name.trim();
        cookieObj.name = cookieName;
        cookieObj.value = valueParts.join('=').trim(); // 处理值中可能包含的等号

        // 处理其他属性（如Expires, Path, Domain等）
        for (const part of parts.slice(1)) {
          const [key, ...valueParts] = part.split('=');
          const value = valueParts.join('=').trim(); // 处理值中可能包含的等号
          if (key) {
            const keyLower = key.toLowerCase();
            cookieObj[keyLower] = value || 'true'; // 无值属性（如HttpOnly）设为true

            // 如果是expires字段，添加时间戳
            if (keyLower === 'expires' && value) {
              const timestamp = Date.parse(value);
              if (!Number.isNaN(timestamp)) {
                cookieObj.expires_timestamp = timestamp; // 添加时间戳（毫秒）
              }
            }
          }
        }

        // Only add valid cookies to the map (overwrite if duplicate name)
        if (cookieObj.name) {
          cookieMap.set(cookieName, cookieObj);
        }
      }
    }

    return Array.from(cookieMap.values());
  }

  private static isExpired(cookie: CookieEntity): boolean {
    if (!cookie.value || cookie.value === 'EXPIRED') {
      return true;
    }

    const maxAge = Number(cookie['max-age']);
    if (Number.isFinite(maxAge) && maxAge <= 0) {
      return true;
    }

    const expiresTimestamp = Number(cookie.expires_timestamp);
    return Number.isFinite(expiresTimestamp) && expiresTimestamp <= Date.now();
  }
}
