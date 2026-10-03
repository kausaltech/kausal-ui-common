const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';
}

/**
 * The public origin of a request, e.g. `https://sunnydale.watch.kausal.tech`.
 *
 * With `trustedProxyHeaders`, `X-Forwarded-Host` and `X-Forwarded-Proto` take
 * precedence; the reverse proxy in front of the app must set them. Returns
 * null when the request has no usable host.
 */
export function getRequestOrigin(
  headers: Headers,
  { trustedProxyHeaders }: { trustedProxyHeaders: boolean }
): string | null {
  const firstValue = (name: string) => headers.get(name)?.split(',')[0]?.trim() || null;
  const host = (trustedProxyHeaders ? firstValue('x-forwarded-host') : null) ?? firstValue('host');
  if (!host || !HOST_RE.test(host)) return null;

  const hostname = host.split(':')[0].toLowerCase();
  let proto = trustedProxyHeaders ? firstValue('x-forwarded-proto') : null;
  if (proto !== 'http' && proto !== 'https') {
    proto = isLoopbackHost(hostname) ? 'http' : 'https';
  }
  return `${proto}://${host.toLowerCase()}`;
}
