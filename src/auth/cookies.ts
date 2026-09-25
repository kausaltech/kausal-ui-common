import { AUTH_COOKIE_PREFIX, LEGACY_AUTHJS_SESSION_COOKIES } from './constants';

function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
  }
  return cookies;
}

function setCookieHeader(reqHeaders: Headers, cookies: Map<string, string>) {
  if (cookies.size === 0) {
    reqHeaders.delete('cookie');
    return;
  }
  reqHeaders.set(
    'cookie',
    Array.from(cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  );
}

/**
 * Merge rotated cookies (from Set-Cookie lines) into a downstream request's
 * Cookie header, so that the RSC render sees the fresh values via `cookies()`.
 * A Set-Cookie that expires the cookie removes it from the request.
 */
export function mergeRequestCookies(reqHeaders: Headers, setCookies: string[]) {
  const cookies = parseCookieHeader(reqHeaders.get('cookie'));
  for (const line of setCookies) {
    const [nameValue = '', ...attributes] = line.split(';');
    const idx = nameValue.indexOf('=');
    if (idx === -1) continue;
    const name = nameValue.slice(0, idx).trim();
    const isExpired = attributes.some((attr) => {
      const [key = '', value = ''] = attr.split('=').map((s) => s.trim().toLowerCase());
      return key === 'max-age' && Number(value) <= 0;
    });
    if (isExpired) {
      cookies.delete(name);
    } else {
      cookies.set(name, nameValue.slice(idx + 1));
    }
  }
  setCookieHeader(reqHeaders, cookies);
}

export function isAuthCookieName(name: string) {
  const unprefixed = name.startsWith('__Secure-') ? name.slice('__Secure-'.length) : name;
  return (
    unprefixed.startsWith(AUTH_COOKIE_PREFIX) || LEGACY_AUTHJS_SESSION_COOKIES.includes(name)
  );
}

/** Remove all auth cookies from a downstream request's Cookie header. */
export function removeAuthRequestCookies(reqHeaders: Headers) {
  const cookies = parseCookieHeader(reqHeaders.get('cookie'));
  for (const name of Array.from(cookies.keys())) {
    if (isAuthCookieName(name)) cookies.delete(name);
  }
  setCookieHeader(reqHeaders, cookies);
}
