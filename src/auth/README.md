# Authentication (better-auth)

Shared user authentication for the Kausal UIs. The Kausal backend (Django +
django-oauth-toolkit) is the OIDC provider; the UI is a confidential client
using the authorization-code flow with PKCE.

better-auth runs **stateless**, with no database:

| Cookie                      | Contents                                          |
| --------------------------- | ------------------------------------------------- |
| `better-auth.session_token` | signed session token                              |
| `better-auth.session_data`  | JWE cookie cache of the session and user (7 days) |
| `better-auth.account_data`  | encrypted OAuth access, refresh and ID tokens     |

Over HTTPS the names get the `__Secure-` prefix.

## Modules

| Module                                                          | Use                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `server.ts`                                                     | `createKausalAuth(opts)` / `createPerOriginKausalAuth(opts)`: better-auth    |
| `server-helpers.ts`                                             | `createAuthServerHelpers(auth)`: session and token accessors (see below)     |
| `routes.ts`                                                     | Route handlers for `/api/auth/[...all]` and the invalid-token recovery route |
| `client.ts`                                                     | `createKausalAuthClient()` for the browser                                   |
| `session-context.tsx`                                           | `AuthSessionProvider` / `useAuthSession()`, seeded with the server session   |
| `session.ts`                                                    | `toClientAuthSession()`: the session passed to the browser, without tokens   |
| `invalid-token.ts`                                              | Browser recovery (sign out + reload) after the backend rejects the token     |
| `allowed-hosts.ts`, `origin.ts`, `cookies.ts`, `return-path.ts` | Pure helpers, tested in `__tests__`                                          |

### `createKausalAuth` options

- `providerId` (default `kausal`): the callback path is
  `/api/auth/callback/<providerId>`, which the backend must accept.
- `baseURL`: a fixed public origin, instead of resolving it per request from
  the allowed hosts below.
- `trustedProxyHeaders`: derive the public origin from `X-Forwarded-Host` /
  `X-Forwarded-Proto`, when Next.js only sees the internal origin (e.g. behind Caddy).
- `omitExpiredAccessToken`: leave an expired access token out of the session,
  so that requests go out anonymously instead of being rejected by the backend.
- `disableRateLimit`: turn off better-auth's rate limiter. It keys requests by
  the client IP from `X-Forwarded-For`, and behind several proxies (ingress +
  Caddy) it can't resolve one: all users then share a bucket of 3 sign-ins
  per 10 seconds. Without password endpoints there is nothing to brute-force.

### Apps on unknown hostnames

Every allowed host is also a **trusted origin**, for callback URLs and for the
CSRF origin check. A catch-all pattern like `*` would therefore allow open
redirects and cross-origin requests. Apps served on customer domains that
aren't known in advance use `createPerOriginKausalAuth` instead: one instance
per request origin (cached, LRU), each trusting only its own origin, like
next-auth's `trustHost`. The backend must then only accept redirect URIs on
the app's real hostnames.

## Environment variables

| Variable             | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `AUTH_SECRET`        | Encrypts the cookies. **Must be the same on every replica.**            |
| `AUTH_CLIENT_ID`     | OAuth client of the UI (`AuthApplication` in the backend)               |
| `AUTH_CLIENT_SECRET` |                                                                         |
| `AUTH_ISSUER`        | OIDC issuer; defaults to the backend URL                                |
| `AUTH_ALLOWED_HOSTS` | Extra allowed hostnames, comma-separated (on top of `WILDCARD_DOMAINS`) |

With `createKausalAuth` and no `baseURL`, better-auth refuses requests on hosts
that don't match `*.<wildcard domain>` or `AUTH_ALLOWED_HOSTS` (in dev and CI,
any port). `createPerOriginKausalAuth` doesn't use these.

## Token flow

The backend accepts the access token as `Authorization: Bearer`. A rejected
token fails the whole GraphQL operation with code `UNAUTHENTICATED` and a
message starting with `invalid_token`.

| Layer              | How the token is obtained                                       |
| ------------------ | --------------------------------------------------------------- |
| Proxy (middleware) | `refreshAccessTokenIfNeeded`, then `getSessionWithCookies`      |
| RSC                | `getAccessToken()`: **read-only**                               |
| `/api/graphql`     | `getFreshAccessToken()`, passed to `proxyGraphQLRequest`        |
| Browser            | never holds the token; client queries go through `/api/graphql` |

### Why RSC must not refresh

The backend rotates refresh tokens (`ROTATE_REFRESH_TOKEN`, no grace period),
so a refresh consumes the refresh token. RSC can't write cookies, so the
rotated tokens would be lost. The proxy therefore refreshes before the render
and merges the rotated cookies into the request (`mergeRequestCookies`) and
into the response. `/api/*` routes don't pass through the proxy, so
`/api/graphql` refreshes on its own.

The proxy also forwards the Set-Cookies better-auth emits when it refreshes the
session cookie cache, since page loads may be the only requests a user makes.

### Multi-pod rotation race (accepted)

Without a database there is nothing to lock: two replicas refreshing the same
token at once race, and the loser's refresh token is already consumed, which
costs the user a re-login. This is rare, because access tokens live for 7
days. If it becomes a problem: add a refresh-token grace period in the
backend, or keep accounts in a database.

## Failure modes

- Refresh fails (refresh token revoked or expired, IdP down): the helpers
  return `null` and the request goes out anonymously.
- The backend rejects the token:
  - in the browser: `createInvalidTokenRecovery` signs out through the
    better-auth client and reloads, once;
  - in RSC: redirect to `RECOVER_INVALID_TOKEN_PATH`
    (`createRecoverInvalidTokenHandler`), which signs out server-side and
    redirects back to `?returnTo=`.
