import * as cookie from 'cookie';
import setCookie from 'set-cookie-parser';

import { getProductId } from '@common/env/static';

const API_COOKIE_PREFIX = 'api_';

export type APIType = 'watch' | 'paths';

function getCookiePrefix(apiType?: APIType) {
  if (!apiType) apiType = getProductId() satisfies APIType;
  return `${apiType}_${API_COOKIE_PREFIX}`;
}

export function getApiCookies(headers: Headers, apiType?: APIType) {
  const reqCookieHeader = headers.get('cookie');
  if (!reqCookieHeader) {
    return [];
  }
  const backendCookies: string[] = [];
  const cookies = cookie.parse(reqCookieHeader);
  const prefix = getCookiePrefix(apiType);
  Object.entries(cookies).forEach(([name, value]) => {
    if (!name.startsWith(prefix)) return;
    const upstreamName = name.slice(prefix.length);
    backendCookies.push(`${upstreamName}=${value}`);
  });
  return backendCookies;
}

export function getClientCookiesFromBackendResponse(
  backendResponse: Response,
  apiType?: APIType
): string[] {
  // Pass cookies to the client, modify some of the attributes along the way
  const cookies = setCookie.parse(backendResponse.headers.getSetCookie());
  const prefix = getCookiePrefix(apiType);
  return cookies.map((ck) => {
    return cookie.serialize(`${prefix}${ck.name}`, ck.value, {
      expires: ck.expires,
      maxAge: ck.maxAge,
      httpOnly: ck.httpOnly,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  });
}
