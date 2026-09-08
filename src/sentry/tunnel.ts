import { FAKE_SENTRY_DSN } from '@common/constants/routes.mjs';
import { getSpotlightUrl } from '@common/env';

type ForwardOptions = {
  clientIp?: string;
  contentType?: string | null;
  referer?: string | null;
};

export function isSpotlightFakeDsn(uri: string) {
  if (getSpotlightUrl()) return false;
  return uri == FAKE_SENTRY_DSN;
}

export async function forwardToSentry(
  envelopeBytes: ArrayBuffer,
  sentryDsn: URL | null,
  options: ForwardOptions = {}
) {
  const { clientIp, contentType, referer } = options;
  if (contentType?.toLowerCase().startsWith('text/plain')) {
    const encoding = contentType.toLowerCase().split(';')[1]?.trim();
    if (encoding !== 'charset=utf-8') {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
  }
  const envelope = new TextDecoder().decode(envelopeBytes);
  const [rawHeader, ...otherPieces] = envelope.split('\n');
  const header = JSON.parse(rawHeader) as Record<string, string>;
  const dsn = new URL(header['dsn']);
  const projectId = dsn.pathname?.replace('/', '');

  if (!isSpotlightFakeDsn(header['dsn'])) {
    // Todo bien
  } else if (sentryDsn) {
    if (dsn.hostname !== sentryDsn.hostname) {
      throw new Error(`Invalid Sentry DSN hostname: ${dsn.hostname}`);
    }
    if (dsn.pathname !== sentryDsn.pathname || !projectId) {
      throw new Error(`Invalid Sentry DSN path: ${dsn.pathname}`);
    }
  } else {
    throw new Error('Sentry DSN not configured');
  }
  let httpBody: string | ArrayBuffer;
  const httpHeaders: Record<string, string> = {};
  if (referer) {
    httpHeaders['referer'] = referer;
  }
  if (contentType) {
    if (clientIp) {
      header['forwarded_for'] = clientIp;
    }
    httpHeaders['content-type'] = contentType;
    httpBody = [JSON.stringify(header), ...otherPieces].join('\n');
  } else {
    httpBody = envelopeBytes;
  }
  if (isSpotlightFakeDsn(header['dsn'])) {
    httpHeaders['content-type'] = 'application/x-sentry-envelope';
  }
  const upstreamUrl = sentryDsn
    ? `${sentryDsn.protocol}//${sentryDsn.hostname}/api/${projectId}/envelope/`
    : getSpotlightUrl();
  if (!upstreamUrl) {
    throw new Error('No Sentry upstream URL');
  }
  const resp = await fetch(upstreamUrl, {
    method: 'POST',
    body: httpBody,
    headers: httpHeaders,
  });
  return resp;
}
