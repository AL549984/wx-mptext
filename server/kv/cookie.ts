import { type CookieEntity } from '~/server/utils/AccountCookie';
import { DEFAULT_MP_SESSION_TTL_SECONDS } from '~/server/utils/mp-session';

export type CookieKVKey = string;

export interface CookieKVValue {
  token: string;
  cookies: CookieEntity[];
}

export async function setMpCookie(
  key: CookieKVKey,
  data: CookieKVValue,
  expirationTtl = DEFAULT_MP_SESSION_TTL_SECONDS
): Promise<boolean> {
  const kv = useStorage('kv');
  try {
    await kv.set<CookieKVValue>(`cookie:${key}`, data, {
      // https://developers.cloudflare.com/kv/api/write-key-value-pairs/#expiring-keys
      expirationTtl,
    });
    return true;
  } catch (err) {
    console.error('kv.set call failed:', err);
    return false;
  }
}

export async function getMpCookie(key: CookieKVKey): Promise<CookieKVValue | null> {
  const kv = useStorage('kv');
  return await kv.get<CookieKVValue>(`cookie:${key}`);
}

export async function deleteMpCookie(key: CookieKVKey): Promise<void> {
  const kv = useStorage('kv');
  await kv.removeItem(`cookie:${key}`);
}
