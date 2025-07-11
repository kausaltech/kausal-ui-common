import { defineIntegration, serializeEnvelope } from '@sentry/core';
import type { Client, Envelope, Event, IntegrationFn } from '@sentry/core';

export type SpotlightConnectionOptions = {
  /**
   * Set this if the Spotlight Sidecar is not running on localhost:8969
   * By default, the Url is set to http://localhost:8969/stream
   */
  sidecarUrl?: string;
};

export const INTEGRATION_NAME = 'SpotlightFetch';

const _spotlightIntegration = ((options: Partial<SpotlightConnectionOptions> = {}) => {
  const sidecarUrl = options.sidecarUrl || 'http://localhost:8969/stream';

  return {
    name: INTEGRATION_NAME,
    setup: () => {
      console.log('Using Sidecar URL', sidecarUrl);
    },
    // We don't want to send interaction transactions/root spans created from
    // clicks within Spotlight to Sentry. Neither do we want them to be sent to
    // spotlight.
    processEvent: (event) => (isSpotlightInteraction(event) ? null : event),
    afterAllSetup: (client: Client) => {
      setupSidecarForwarding(client, sidecarUrl);
    },
  };
}) satisfies IntegrationFn;

function setupSidecarForwarding(client: Client, sidecarUrl: string): void {
  let failCount = 0;

  client.on('beforeEnvelope', (envelope: Envelope) => {
    if (failCount > 3) {
      console.warn(
        '[Spotlight] Disabled Sentry -> Spotlight integration due to too many failed requests:',
        failCount
      );
      return;
    }

    fetch(sidecarUrl, {
      method: 'POST',
      body: serializeEnvelope(envelope),
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      mode: 'cors',
    }).then(
      (res) => {
        if (res.status >= 200 && res.status < 400) {
          // Reset failed requests counter on success
          failCount = 0;
        }
      },
      (err) => {
        failCount++;
        console.warn(
          "Sentry SDK can't connect to Sidecar is it running? See: https://spotlightjs.com/sidecar/npx/",
          err
        );
      }
    );
  });
}

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 */
export const spotlightFetchIntegration = defineIntegration(_spotlightIntegration);

/**
 * Flags if the event is a transaction created from an interaction with the spotlight UI.
 */
export function isSpotlightInteraction(event: Event): boolean {
  return Boolean(
    event.type === 'transaction' &&
      event.spans &&
      event.contexts &&
      event.contexts.trace &&
      event.contexts.trace.op === 'ui.action.click' &&
      event.spans.some(
        ({ description }) => description && description.includes('#sentry-spotlight')
      )
  );
}
