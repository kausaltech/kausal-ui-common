/* istanbul ignore file */

/** The provider id of the Kausal backend in the better-auth `genericOAuth` config. */
export const KAUSAL_PROVIDER_ID = 'kausal';

/** Where the better-auth route handler is mounted (`src/app/api/auth/[...all]/route.ts`). */
export const AUTH_BASE_PATH = '/api/auth';

/** Route that clears a rejected OAuth session; see `createRecoverInvalidTokenHandler`. */
export const RECOVER_INVALID_TOKEN_PATH = `${AUTH_BASE_PATH}/recover-invalid-token`;

export const DEFAULT_AUTH_SCOPES = ['openid', 'email', 'profile'];

/**
 * Prefix of every cookie better-auth sets: `session_token`, `session_data` and
 * `account_data`. Over HTTPS the cookies additionally get the `__Secure-` prefix.
 */
export const AUTH_COOKIE_PREFIX = 'better-auth.';

/** Session cookies set by next-auth / Auth.js, cleared after migrating an app. */
export const LEGACY_AUTHJS_SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];
