/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server';

import { applySecurityHeaders, buildReportOnlyPolicy } from '../security-headers';

const options = {
  dsn: 'https://publickey@sentry.example.com/42',
  assetPrefix: 'https://cdn.example.com',
  environment: 'production',
  release: 'build-1',
};

const sourcesOf = (policy: string, directive: string) =>
  policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find((parts) => parts[0] === directive)
    ?.slice(1) ?? [];

const request = (protocol: 'http' | 'https') =>
  ({
    headers: new Headers(protocol === 'https' ? { 'x-forwarded-proto': 'https' } : {}),
    nextUrl: { protocol: 'http:' },
  }) as unknown as NextRequest;

describe('buildReportOnlyPolicy', () => {
  it('reports to the security endpoint derived from the Sentry DSN', () => {
    const reportUri = new URL(sourcesOf(buildReportOnlyPolicy(options)!, 'report-uri')[0]);

    expect(reportUri.origin).toBe('https://sentry.example.com');
    expect(reportUri.pathname).toBe('/api/42/security/');
    expect(reportUri.searchParams.get('sentry_key')).toBe('publickey');
    expect(reportUri.searchParams.get('sentry_environment')).toBe('production');
    expect(reportUri.searchParams.get('sentry_release')).toBe('build-1');
  });

  /* A self-hosted Sentry can live under a path prefix: the project id is the last segment. */
  it('keeps a path prefix out of the project id', () => {
    const policy = buildReportOnlyPolicy({
      ...options,
      dsn: 'https://publickey@example.com/sentry/42',
    })!;

    expect(new URL(sourcesOf(policy, 'report-uri')[0]).pathname).toBe('/sentry/api/42/security/');
  });

  it('allows the asset host and the Sentry origin', () => {
    const policy = buildReportOnlyPolicy(options)!;

    expect(sourcesOf(policy, 'script-src')).toContain('https://cdn.example.com');
    expect(sourcesOf(policy, 'connect-src')).toContain('https://sentry.example.com');
  });

  it('adds the product-specific script and connect sources', () => {
    const policy = buildReportOnlyPolicy({
      ...options,
      scriptSources: ['https://script.example.com'],
      connectSources: ['https://api.example.com'],
    })!;

    expect(sourcesOf(policy, 'script-src')).toContain('https://script.example.com');
    expect(sourcesOf(policy, 'connect-src')).toContain('https://api.example.com');
  });

  /* Styles, fonts and images cannot execute code, so their hosts are not worth enumerating. */
  it.each(['style-src', 'font-src', 'img-src'])('allows any HTTPS host in %s', (directive) => {
    expect(sourcesOf(buildReportOnlyPolicy(options)!, directive)).toContain('https:');
  });

  it('keeps scripts and connections to the listed hosts', () => {
    const policy = buildReportOnlyPolicy(options)!;

    expect(sourcesOf(policy, 'script-src')).not.toContain('https:');
    expect(sourcesOf(policy, 'connect-src')).not.toContain('https:');
  });

  /* Mapbox GL starts its worker from a blob: URL. */
  it('allows blob workers', () => {
    expect(sourcesOf(buildReportOnlyPolicy(options)!, 'worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('is left out in CI', () => {
    expect(buildReportOnlyPolicy({ ...options, environment: 'ci' })).toBeUndefined();
  });

  it('is left out when no DSN is configured', () => {
    expect(buildReportOnlyPolicy({ ...options, dsn: undefined })).toBeUndefined();
  });

  /* A malformed value must not throw, since the policy is built when the module loads. */
  it.each([
    ['assetPrefix', { assetPrefix: 'cdn.example.com' }],
    ['dsn', { dsn: 'not a dsn' }],
  ])('survives a malformed %s', (_name, override) => {
    expect(() => buildReportOnlyPolicy({ ...options, ...override })).not.toThrow();
  });
});

describe('applySecurityHeaders', () => {
  /* Auth.js rebuilds the middleware result as a native Response, never a NextResponse. */
  it('sets the constant security headers on a native Response', () => {
    const { headers } = applySecurityHeaders(new Response(null), request('https'));

    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
  });

  it('passes through a handler result that is not a response', () => {
    expect(applySecurityHeaders(undefined, request('https'))).toBeUndefined();
  });

  it('denies framing unless the response is framable', () => {
    const { headers } = applySecurityHeaders(new Response(null), request('https'));

    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self'; upgrade-insecure-requests"
    );
  });

  it('leaves a framable response unrestricted', () => {
    const { headers } = applySecurityHeaders(new Response(null), request('https'), {
      isFramable: () => true,
    });

    expect(headers.has('x-frame-options')).toBe(false);
    expect(headers.get('content-security-policy')).toBe('upgrade-insecure-requests');
  });

  /* Production images are also served over plain HTTP, where an upgrade would break assets. */
  it('only asks for an upgrade when the request arrived over TLS', () => {
    const { headers } = applySecurityHeaders(new Response(null), request('http'));

    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
  });

  it('sets the report-only policy it is given', () => {
    const { headers } = applySecurityHeaders(new Response(null), request('https'), {
      reportOnlyPolicy: "default-src 'self'",
    });

    expect(headers.get('content-security-policy-report-only')).toBe("default-src 'self'");
  });
});
