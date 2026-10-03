/**
 * @jest-environment node
 */
import { buildAllowedHosts } from '../allowed-hosts';
import { isAuthCookieName, mergeRequestCookies, removeAuthRequestCookies } from '../cookies';
import { isInvalidTokenMessage } from '../invalid-token';
import { getRequestOrigin } from '../origin';
import { safeReturnPath } from '../return-path';
import { hasSessionExpired, toClientAuthSession } from '../session';

jest.mock('@common/env', () => ({
  getDeploymentType: () => 'production',
  getWildcardDomains: () => [],
  isLocalDev: false,
}));

describe('buildAllowedHosts', () => {
  it('turns wildcard domains into host patterns', () => {
    expect(
      buildAllowedHosts({ wildcardDomains: ['watch.kausal.tech'], allowAnyPort: false })
    ).toEqual(['*.watch.kausal.tech']);
  });

  it('adds port wildcards in dev and CI', () => {
    expect(buildAllowedHosts({ wildcardDomains: ['localhost'], allowAnyPort: true })).toEqual([
      '*.localhost',
      '*.localhost:*',
    ]);
  });

  it('appends extra hosts from AUTH_ALLOWED_HOSTS', () => {
    expect(
      buildAllowedHosts({
        wildcardDomains: ['watch.kausal.tech'],
        extraHosts: ' ilmasto.example.fi , ,climate.example.com',
        allowAnyPort: false,
      })
    ).toEqual(['*.watch.kausal.tech', 'ilmasto.example.fi', 'climate.example.com']);
  });

  it('falls back to localhost when nothing is configured (e.g. during build)', () => {
    expect(buildAllowedHosts({ wildcardDomains: [], allowAnyPort: false })).toEqual(['localhost']);
  });
});

describe('mergeRequestCookies', () => {
  it('overwrites rotated cookies and keeps the others', () => {
    const headers = new Headers({ cookie: 'a=1; better-auth.account_data=old; b=2' });
    mergeRequestCookies(headers, [
      'better-auth.account_data=new; Path=/; HttpOnly; SameSite=Lax',
      'better-auth.session_data=fresh; Path=/; Max-Age=604800',
    ]);
    expect(headers.get('cookie')).toBe(
      'a=1; better-auth.account_data=new; b=2; better-auth.session_data=fresh'
    );
  });

  it('removes cookies that the Set-Cookie expires', () => {
    const headers = new Headers({ cookie: 'a=1; better-auth.session_token=x' });
    mergeRequestCookies(headers, ['better-auth.session_token=; Max-Age=0; Path=/']);
    expect(headers.get('cookie')).toBe('a=1');
  });

  it('creates the Cookie header if the request had none', () => {
    const headers = new Headers();
    mergeRequestCookies(headers, ['better-auth.session_data=v; Path=/']);
    expect(headers.get('cookie')).toBe('better-auth.session_data=v');
  });
});

describe('auth request cookies', () => {
  it('recognizes better-auth and legacy Auth.js cookies', () => {
    expect(isAuthCookieName('better-auth.session_token')).toBe(true);
    expect(isAuthCookieName('__Secure-better-auth.account_data')).toBe(true);
    expect(isAuthCookieName('authjs.session-token')).toBe(true);
    expect(isAuthCookieName('__Secure-authjs.session-token')).toBe(true);
    expect(isAuthCookieName('selected-workflow')).toBe(false);
    expect(isAuthCookieName('watch_api_sessionid')).toBe(false);
  });

  it('strips only the auth cookies from a request', () => {
    const headers = new Headers({
      cookie: 'selected-workflow=DRAFT; __Secure-better-auth.session_token=x; authjs.session-token=y',
    });
    removeAuthRequestCookies(headers);
    expect(headers.get('cookie')).toBe('selected-workflow=DRAFT');
  });

  it('drops the Cookie header when nothing is left', () => {
    const headers = new Headers({ cookie: 'better-auth.session_token=x' });
    removeAuthRequestCookies(headers);
    expect(headers.has('cookie')).toBe(false);
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/actions/1?x=1', '/actions/1?x=1'],
    ['/', '/'],
    [null, '/'],
    ['', '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});

describe('isInvalidTokenMessage', () => {
  it('matches the backend OAuth token errors', () => {
    expect(isInvalidTokenMessage('invalid_token: The access token has expired.')).toBe(true);
    expect(isInvalidTokenMessage('invalid_token')).toBe(true);
    expect(isInvalidTokenMessage('insufficient_scope: nope')).toBe(false);
    expect(isInvalidTokenMessage(undefined)).toBe(false);
  });
});

describe('toClientAuthSession', () => {
  const serverSession = {
    user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' },
    session: { expiresAt: new Date('2030-01-01T00:00:00Z') },
    accessToken: 'secret',
    hasAccessToken: true,
  };

  it('maps the session without exposing tokens', () => {
    const session = toClientAuthSession(serverSession);
    expect(session).toEqual({
      user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com', image: null },
      expires: '2030-01-01T00:00:00.000Z',
      hasAccessToken: true,
    });
    expect(JSON.stringify(session)).not.toContain('secret');
  });

  it('returns null without a session', () => {
    expect(toClientAuthSession(null)).toBeNull();
  });

  it('detects an expired session', () => {
    expect(hasSessionExpired({ expires: '2000-01-01T00:00:00Z' })).toBe(true);
    expect(hasSessionExpired({ expires: '2999-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('getRequestOrigin', () => {
  const origin = (headers: Record<string, string>, trustedProxyHeaders = true) =>
    getRequestOrigin(new Headers(headers), { trustedProxyHeaders });

  it('uses the forwarded host and protocol behind a trusted proxy', () => {
    expect(
      origin({
        host: 'localhost:3000',
        'x-forwarded-host': 'Sunnydale.watch.kausal.tech',
        'x-forwarded-proto': 'https',
      })
    ).toBe('https://sunnydale.watch.kausal.tech');
  });

  it('ignores forwarded headers unless trusted', () => {
    expect(
      origin({ host: 'app.example.com', 'x-forwarded-host': 'evil.example' }, false)
    ).toBe('https://app.example.com');
  });

  it('takes the first value of a comma-separated forwarded header', () => {
    expect(
      origin({ 'x-forwarded-host': 'a.example.com, proxy.internal', 'x-forwarded-proto': 'https,http' })
    ).toBe('https://a.example.com');
  });

  it('defaults to http for loopback hosts and https otherwise', () => {
    expect(origin({ host: 'sunnydale.localhost:3000' })).toBe('http://sunnydale.localhost:3000');
    expect(origin({ host: 'klimaschutz.example.de' })).toBe('https://klimaschutz.example.de');
  });

  it('rejects malformed hosts', () => {
    expect(origin({ host: 'evil.example/path' })).toBeNull();
    expect(origin({ host: 'a@b.example' })).toBeNull();
    expect(origin({})).toBeNull();
  });
});
