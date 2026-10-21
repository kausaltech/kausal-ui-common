import type { NextRequest } from 'next/server';

const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/* Built at module load, so a malformed environment value must degrade rather than throw. */
export const originOf = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

function securityReportUri(dsn: string, environment: string, release: string) {
  let parsed: URL;

  try {
    parsed = new URL(dsn);
  } catch {
    return undefined;
  }

  const { origin, username, pathname } = parsed;
  const segments = pathname.split('/').filter(Boolean);
  const projectId = segments.pop();
  const prefix = segments.length ? `/${segments.join('/')}` : '';

  if (!username || !projectId) {
    return undefined;
  }

  const params = new URLSearchParams({
    sentry_key: username,
    sentry_environment: environment,
    sentry_release: release,
  });

  return `${origin}${prefix}/api/${projectId}/security/?${params.toString()}`;
}

export type ReportOnlyPolicyOptions = {
  dsn: string | undefined;
  assetPrefix: string | undefined;
  environment: string;
  release: string;
  scriptSources?: string[];
  connectSources?: string[];
};

/*
 * Restricts scripts and connections only. Styles, fonts and images cannot execute code, so any
 * HTTPS host is allowed for them. Inline scripts are allowed until there are per-request nonces.
 */
export function buildReportOnlyPolicy({
  dsn,
  assetPrefix,
  environment,
  release,
  scriptSources = [],
  connectSources = [],
}: ReportOnlyPolicyOptions) {
  const reportUri =
    dsn && environment !== 'ci' ? securityReportUri(dsn, environment, release) : undefined;

  if (!reportUri) {
    return undefined;
  }

  const sentryOrigin = new URL(reportUri).origin;
  const cdn = originOf(assetPrefix);
  const sources = (...values: (string | undefined)[]) =>
    [...new Set([...values, cdn].filter((value) => value !== undefined))].join(' ');

  return [
    "default-src 'self'",
    `script-src ${sources("'self'", "'unsafe-inline'", "'unsafe-eval'", ...scriptSources)}`,
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "img-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    `connect-src ${sources("'self'", sentryOrigin, ...connectSources)}`,
    'frame-src https:',
    `report-uri ${reportUri}`,
  ].join('; ');
}

/* Keyed on how the request arrived, not on the build: images are also served over plain HTTP. */
const isSecureRequest = (request: NextRequest) =>
  request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';

export type SecurityHeaderOptions = {
  reportOnlyPolicy?: string;
  /* Responses meant to be framed by third-party sites, such as embed views. */
  isFramable?: (response: Response) => boolean;
};

export function applySecurityHeaders<R>(
  response: R,
  request: NextRequest,
  { reportOnlyPolicy, isFramable }: SecurityHeaderOptions = {}
): R {
  if (!(response instanceof Response)) {
    return response;
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  const directives = isSecureRequest(request) ? ['upgrade-insecure-requests'] : [];

  if (!isFramable?.(response)) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    directives.unshift("frame-ancestors 'self'");
  }

  if (directives.length) {
    response.headers.set('Content-Security-Policy', directives.join('; '));
  }

  if (reportOnlyPolicy) {
    response.headers.set('Content-Security-Policy-Report-Only', reportOnlyPolicy);
  }

  return response;
}
