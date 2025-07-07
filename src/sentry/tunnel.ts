type ForwardOptions = {
  clientIp?: string;
  contentType?: string | null;
  referer?: string | null;
}

export async function forwardToSentry(
  envelopeBytes: ArrayBuffer,
  sentryDsn: URL,
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
  const header = JSON.parse(rawHeader) as object;
  const dsn = new URL(header['dsn'] as string);
  const projectId = dsn.pathname?.replace('/', '');

  if (dsn.hostname !== sentryDsn.hostname) {
    throw new Error(`Invalid Sentry DSN hostname: ${dsn.hostname}`);
  }
  if (dsn.pathname !== sentryDsn.pathname || !projectId) {
    throw new Error(`Invalid Sentry DSN path: ${dsn.pathname}`);
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

  const sentryEnvelopeURL = `${sentryDsn.protocol}//${sentryDsn.hostname}/api/${projectId}/envelope/`;
  const resp = await fetch(sentryEnvelopeURL, {
    method: 'POST',
    body: httpBody,
    headers: httpHeaders,
  });
  return resp;
}
