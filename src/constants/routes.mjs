/* istanbul ignore file */

export const GRAPHQL_CLIENT_PROXY_PATH = '/api/graphql';

export const SENTRY_TUNNEL_PUBLIC_PATH = '/sdk-events';
export const API_SENTRY_TUNNEL_PATH = '/api/sentry-event';

export const HEALTH_CHECK_PUBLIC_PATH = '/_health';
export const API_HEALTH_CHECK_PATH = '/api/health';
export const NEXT_AUTH_SESSION_PATH = '/api/auth/session';

// This is a fake Sentry DSN that we use to initialize Sentry when Spotlight is enabled,
// but we don't have a real Sentry DSN.
export const FAKE_SENTRY_DSN = 'http://abcd@sentry.localhost/1';
