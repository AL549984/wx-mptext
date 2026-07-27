const INTERNAL_COOKIE_NAMES = new Set(['auth-key', 'switch_account']);
const TRANSIENT_LOGIN_COOKIE_NAMES = new Set(['uuid']);

function cookieName(rawCookie: string): string {
  const firstPart = rawCookie.split(';', 1)[0] || '';
  const separator = firstPart.indexOf('=');
  return separator > 0 ? firstPart.slice(0, separator).trim() : '';
}

function requestCookieParts(cookieHeader: string): string[] {
  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
}

export function cookiesForLoginStore(cookieHeader: string, responseCookies: string[]): string[] {
  const cookies = new Map<string, string>();

  for (const rawCookie of [...requestCookieParts(cookieHeader), ...responseCookies]) {
    const name = cookieName(rawCookie);
    if (!name || INTERNAL_COOKIE_NAMES.has(name) || TRANSIENT_LOGIN_COOKIE_NAMES.has(name)) {
      continue;
    }
    cookies.set(name, rawCookie);
  }

  return Array.from(cookies.values());
}

export function cookieForLoginClient(rawCookie: string): string | null {
  const parts = rawCookie
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);
  const name = cookieName(rawCookie);
  if (!name || INTERNAL_COOKIE_NAMES.has(name)) {
    return null;
  }

  const attributes = parts.slice(1).filter(part => !/^domain=/i.test(part) && !/^path=/i.test(part));
  return [parts[0], 'Path=/', ...attributes].join('; ');
}

export function cookiesForLoginClient(responseCookies: string[]): string[] {
  return responseCookies.map(cookieForLoginClient).filter((cookie): cookie is string => Boolean(cookie));
}
