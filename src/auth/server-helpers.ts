import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';

import * as Sentry from '@sentry/nextjs';
import { getSessionCookie } from 'better-auth/cookies';

import { getLogger } from '@common/logging/logger';

import { mergeRequestCookies } from './cookies';
import { type KausalAuthSource, type KausalSession, resolveKausalAuth } from './server';
import { type ClientAuthSession, toClientAuthSession } from './session';

const authLogger = getLogger('auth');

/**
 * Server-side accessors for the session and the OAuth access token.
 *
 * There are two kinds, because with refresh-token rotation a refresh consumes
 * the one-shot refresh token, and the rotated cookies must be persisted:
 *
 * - read-only (`getAuthSession`, `getAccessToken`): safe in RSC, which can't
 *   write cookies. The proxy refreshes the token before RSC renders run.
 * - refreshing (`getFreshAccessToken`, `refreshAccessTokenIfNeeded`): only
 *   in Route Handlers, Server Actions and the proxy.
 */
export function createAuthServerHelpers(source: KausalAuthSource) {
  const authFor = (reqHeaders: Headers) => resolveKausalAuth(source, reqHeaders);

  async function getSessionFromHeaders(reqHeaders: Headers): Promise<KausalSession | null> {
    if (!getSessionCookie(reqHeaders)) return null;
    return await authFor(reqHeaders).api.getSession({ headers: reqHeaders });
  }

  /**
   * For the proxy: the session, plus the Set-Cookie lines better-auth emits
   * when it refreshes the session cookie cache. The proxy must forward those,
   * since page requests may be the only requests an active user makes.
   */
  async function getSessionWithCookies(
    reqHeaders: Headers
  ): Promise<{ session: KausalSession | null; setCookies: string[] }> {
    if (!getSessionCookie(reqHeaders)) return { session: null, setCookies: [] };
    try {
      const result = (await authFor(reqHeaders).api.getSession({
        headers: reqHeaders,
        returnHeaders: true,
      }));
      return { session: result.response, setCookies: result.headers.getSetCookie() };
    } catch (error) {
      Sentry.captureException(error, { level: 'debug' });
      return { session: null, setCookies: [] };
    }
  }

  /** The current session, including the access token. Read-only. */
  async function getAuthSession(): Promise<KausalSession | null> {
    return getSessionFromHeaders(await headers());
  }

  /** The session in the shape that is passed to the browser (no tokens). */
  async function getClientAuthSession(): Promise<ClientAuthSession | null> {
    return toClientAuthSession(await getAuthSession());
  }

  /** The access token for the backend API. Read-only; never refreshes. */
  async function getAccessToken(): Promise<string | null> {
    return (await getAuthSession())?.accessToken ?? null;
  }

  /**
   * An access token for the backend API, refreshed via the IdP if the stored
   * one has expired. Rotated tokens are persisted by the `nextCookies` plugin.
   *
   * Returns null if the user is not signed in or the refresh failed (e.g. the
   * refresh token was revoked); callers proceed unauthenticated.
   */
  async function getFreshAccessToken(): Promise<string | null> {
    const reqHeaders = await headers();
    if (!getSessionCookie(reqHeaders)) return null;
    try {
      const result = await authFor(reqHeaders).api.getAccessToken({
        body: { useAccountCookie: true },
        headers: reqHeaders,
      });
      return result.accessToken ?? null;
    } catch (error) {
      authLogger.debug({ err: error }, 'getFreshAccessToken returned null');
      return null;
    }
  }

  /**
   * For the proxy: refresh the access token if it has expired, before the RSC
   * render runs. Rotated cookies are merged into `reqHeaders` (so the render
   * sees them) and returned as Set-Cookie lines for the browser.
   *
   * Silent on failure: an expired refresh token, a missing account cookie or a
   * transient IdP error all produce `null`.
   */
  async function refreshAccessTokenIfNeeded(
    req: NextRequest,
    reqHeaders: Headers
  ): Promise<string[] | null> {
    if (!getSessionCookie(req)) return null;
    let setCookies: string[];
    try {
      const result = (await authFor(req.headers).api.getAccessToken({
        body: { useAccountCookie: true },
        headers: req.headers,
        returnHeaders: true,
      })) as { headers: Headers; response: unknown };
      setCookies = result.headers.getSetCookie();
    } catch (error) {
      // UNAUTHORIZED, FAILED_TO_GET_ACCESS_TOKEN, ACCOUNT_NOT_FOUND, etc.
      Sentry.captureException(error, { level: 'debug' });
      return null;
    }
    if (setCookies.length === 0) return null;
    mergeRequestCookies(reqHeaders, setCookies);
    return setCookies;
  }

  /**
   * Sign the user out server-side, e.g. after the backend rejected the token.
   * Returns the Set-Cookie lines that expire the auth cookies.
   */
  async function signOutFromHeaders(reqHeaders: Headers): Promise<string[]> {
    try {
      const result = (await authFor(reqHeaders).api.signOut({
        headers: reqHeaders,
        returnHeaders: true,
      })) as { headers: Headers; response: unknown };
      return result.headers.getSetCookie();
    } catch (error) {
      authLogger.warn({ err: error }, 'Server-side sign-out failed');
      return [];
    }
  }

  return {
    getSessionFromHeaders,
    getSessionWithCookies,
    getAuthSession,
    getClientAuthSession,
    getAccessToken,
    getFreshAccessToken,
    refreshAccessTokenIfNeeded,
    signOutFromHeaders,
  };
}
