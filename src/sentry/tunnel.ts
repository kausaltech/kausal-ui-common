import { getLogger } from '../logging';

export async function forwardToSentry(envelopeBytes: ArrayBuffer, sentryDsn: URL) {
  const logger = getLogger('sentry-proxy');
  const envelope = new TextDecoder().decode(envelopeBytes);
  const piece = envelope.split('\n')[0];
  const header = JSON.parse(piece);
  const dsn = new URL(header['dsn']);
  const projectId = dsn.pathname?.replace('/', '');

  if (dsn.hostname !== sentryDsn.hostname) {
    throw new Error(`Invalid Sentry DSN hostname: ${dsn.hostname}`);
  }
  if (dsn.pathname !== sentryDsn.pathname || !projectId) {
    throw new Error(`Invalid Sentry DSN path: ${dsn.pathname}`);
  }

  const sentryEnvelopeURL = `${sentryDsn.protocol}//${sentryDsn.hostname}/api/${projectId}/envelope/`;
  const resp = await fetch(sentryEnvelopeURL, {
    method: 'POST',
    body: envelopeBytes,
  });
  if (resp.status !== 200) {
    logger.error(`Sentry responded with status ${resp.status}`);
  }
}