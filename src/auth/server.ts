import * as Sentry from '@sentry/nextjs';
import { betterAuth } from 'better-auth';
import { getAccountCookie } from 'better-auth/cookies';
import { nextCookies } from 'better-auth/next-js';
import { customSession, genericOAuth } from 'better-auth/plugins';

import { getAuthIssuer } from '@common/env';
import { getLogger } from '@common/logging/logger';

import { getAllowedHosts } from './allowed-hosts';
import { AUTH_BASE_PATH, DEFAULT_AUTH_SCOPES, KAUSAL_PROVIDER_ID } from './constants';
import { getRequestOrigin } from './origin';

export type KausalAuthOptions = {
  providerId?: string;
  scopes?: string[];
  /**
   * A fixed public origin. Without one, the origin is resolved per request
   * from the hosts allowed by `getAllowedHosts()`.
   */
  baseURL?: string;
  /**
   * Derive the public origin from `X-Forwarded-Host` / `X-Forwarded-Proto`.
   * Needed when the Next.js server only sees the internal origin (e.g. behind Caddy).
   */
  trustedProxyHeaders?: boolean;
  /**
   * Leave an expired access token out of the session, so that downstream
   * requests go out unauthenticated rather than with a token the backend rejects.
   */
  omitExpiredAccessToken?: boolean;
  /**
   * Turn off better-auth's in-memory rate limiter. It keys requests by the
   * client IP from `X-Forwarded-For`; behind several proxies it can't resolve
   * one, and then all users share a bucket of 3 sign-ins per 10 seconds. The
   * Kausal UIs have no password endpoints; the IdP authenticates the user.
   */
  disableRateLimit?: boolean;
};

type AccountCookie = Awaited<ReturnType<typeof getAccountCookie>>;

function getUsableAccessToken(account: AccountCookie, omitExpired: boolean): string | null {
  const token = account?.accessToken ?? null;
  if (!token || !omitExpired) return token;
  const expiresAt = account?.accessTokenExpiresAt;
  if (expiresAt != null && new Date(expiresAt) <= new Date()) return null;
  return token;
}

/**
 * Create the better-auth instance used by the Kausal UIs.
 *
 * Runs stateless (no database): the session lives in a JWE cookie cache and
 * the OAuth tokens in an encrypted account cookie. The Kausal backend is the
 * OIDC provider.
 */
export function createKausalAuth(opts: KausalAuthOptions = {}) {
  const {
    providerId = KAUSAL_PROVIDER_ID,
    scopes = DEFAULT_AUTH_SCOPES,
    baseURL,
    trustedProxyHeaders = false,
    omitExpiredAccessToken = false,
    disableRateLimit = false,
  } = opts;
  const logger = getLogger('auth');

  return betterAuth({
    basePath: AUTH_BASE_PATH,
    // Every allowed host is also a trusted origin for callback URLs and the
    // CSRF origin check, so the list must not contain catch-all patterns.
    baseURL: baseURL ?? { allowedHosts: getAllowedHosts() },
    secret: process.env.AUTH_SECRET,
    ...(disableRateLimit ? { rateLimit: { enabled: false } } : {}),
    advanced: {
      trustedProxyHeaders,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 7 * 24 * 60 * 60, // 7 days
        strategy: 'jwe',
        refreshCache: true,
      },
    },
    account: {
      storeStateStrategy: 'cookie',
      storeAccountCookie: true,
    },
    logger: {
      log(level, message, ...args) {
        if (level === 'error') {
          Sentry.captureException(args[0] instanceof Error ? args[0] : new Error(message));
        }
        logger[level]({ args }, message);
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId,
            discoveryUrl: `${getAuthIssuer()}/.well-known/openid-configuration`,
            clientId: process.env.AUTH_CLIENT_ID ?? '',
            clientSecret: process.env.AUTH_CLIENT_SECRET ?? '',
            scopes,
            pkce: true,
          },
        ],
      }),
      customSession(async ({ user, session }, ctx) => {
        const account = await getAccountCookie(ctx);
        const accessToken = getUsableAccessToken(account, omitExpiredAccessToken);
        return {
          user,
          session,
          accessToken,
          hasAccessToken: accessToken != null,
        };
      }),
      nextCookies(),
    ],
  });
}

export type KausalAuth = ReturnType<typeof createKausalAuth>;
export type KausalSession = KausalAuth['$Infer']['Session'];

/** Either one auth instance, or a function that picks one for a request. */
export type KausalAuthSource = KausalAuth | ((headers: Headers) => KausalAuth);

export function resolveKausalAuth(source: KausalAuthSource, headers: Headers): KausalAuth {
  return typeof source === 'function' ? source(headers) : source;
}

const MAX_ORIGIN_INSTANCES = 500;

/**
 * One auth instance per public origin of the request, each with a fixed
 * `baseURL`. For apps served on hostnames that aren't known in advance (e.g.
 * customer domains): each origin trusts only itself for callback URLs and
 * the CSRF origin check, as with next-auth's `trustHost`. The IdP must only
 * accept redirect URIs on the app's real hostnames.
 */
export function createPerOriginKausalAuth(
  opts: Omit<KausalAuthOptions, 'baseURL'> = {}
): (headers: Headers) => KausalAuth {
  const trustedProxyHeaders = opts.trustedProxyHeaders ?? false;
  const instances = new Map<string, KausalAuth>();
  // Used when a request has no usable host; allows no origin but localhost.
  let fallback: KausalAuth | undefined;

  return function authForRequest(headers: Headers): KausalAuth {
    const origin = getRequestOrigin(headers, { trustedProxyHeaders });
    if (!origin) {
      fallback ??= createKausalAuth({ ...opts, baseURL: 'http://localhost' });
      return fallback;
    }
    let instance = instances.get(origin);
    if (instance) {
      // Refresh the entry's position, so the map stays in LRU order.
      instances.delete(origin);
    } else {
      instance = createKausalAuth({ ...opts, baseURL: origin });
      const oldest = instances.keys().next();
      if (instances.size >= MAX_ORIGIN_INSTANCES && !oldest.done) {
        instances.delete(oldest.value);
      }
    }
    instances.set(origin, instance);
    return instance;
  };
}
