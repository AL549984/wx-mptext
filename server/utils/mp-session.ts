export const DEFAULT_MP_SESSION_TTL_DAYS = 3;
export const SECONDS_PER_DAY = 60 * 60 * 24;
export const DEFAULT_MP_SESSION_TTL_SECONDS = DEFAULT_MP_SESSION_TTL_DAYS * SECONDS_PER_DAY;
const AUTH_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function getMpSessionTtlSeconds(value: unknown): number {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_MP_SESSION_TTL_SECONDS;
  }

  return Math.floor(days) * SECONDS_PER_DAY;
}

export function createAuthKeyCookie(authKey: string, ttlSeconds: number): string {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  return `auth-key=${authKey}; Path=/; Max-Age=${ttlSeconds}; Expires=${expires}; Secure; HttpOnly; SameSite=Lax`;
}

export function resolveMpAuthKey(
  configuredAuthKey: unknown,
  existingAuthKey: unknown,
  fallbackAuthKey: string
): string {
  const configured = String(configuredAuthKey || '').trim();
  if (AUTH_KEY_PATTERN.test(configured)) {
    return configured;
  }

  const existing = String(existingAuthKey || '').trim();
  return AUTH_KEY_PATTERN.test(existing) ? existing : fallbackAuthKey;
}
