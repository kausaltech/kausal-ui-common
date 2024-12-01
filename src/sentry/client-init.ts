import * as Sentry from '@sentry/nextjs';
import type { BaseTransportOptions, SamplingContext } from '@sentry/types';
import type { BrowserOptions } from '@sentry/nextjs';
import type * as logging from '@common/logging';

import { API_SENTRY_TUNNEL_PATH, FAKE_SENTRY_DSN, GRAPHQL_CLIENT_PROXY_PATH } from '@common/constants/routes.mjs';
import { getSpotlightUrl, getSentryTraceSampleRate, getWatchBackendUrl, getPathsBackendUrl } from '@common/env/runtime';
import { envToBool } from '@common/env/utils';
import type { SentrySpan } from '@sentry/core';
import { initRootLogger } from '@common/logging/logger';

function makeNullTransport(_options: BaseTransportOptions) {
  return Sentry.createTransport(
    {
      recordDroppedEvent: () => {},
    },
    (_req) => {
      return Promise.resolve({});
    }
  );
}

export function initSentryBrowser() {
  initRootLogger().catch((err) => err);
  const spotlightUrl = getSpotlightUrl();
  const tracePropagationTargets: BrowserOptions['tracePropagationTargets'] = [/\/.*/]
  if (getWatchBackendUrl()) {
    tracePropagationTargets.push(getWatchBackendUrl());
  }
  if (getPathsBackendUrl()) {
    tracePropagationTargets.push(getPathsBackendUrl());
  }
  const config: BrowserOptions = {
    environment: process.env.DEPLOYMENT_TYPE || 'development',
    dsn: process.env.SENTRY_DSN || (spotlightUrl ? FAKE_SENTRY_DSN : undefined),
    tunnel: API_SENTRY_TUNNEL_PATH,
    sendDefaultPii: true,
    enabled: !!(process.env.SENTRY_DSN || spotlightUrl),
    ignoreErrors: ['NEXT_NOT_FOUND'],
    parentSpanIsAlwaysRootSpan: false,
    tracesSampler(ctx: SamplingContext) {
      console.log('tracesSampler', ctx);
      if (ctx.parentSampled !== undefined) return ctx.parentSampled;
      return getSentryTraceSampleRate();
    },
    tracePropagationTargets,
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: envToBool(process.env.SENTRY_DEBUG, false),
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: envToBool(process.env.SENTRY_SESS, false) ? 1.0 : 0.0,
    transport: process.env.SENTRY_DSN ? undefined : makeNullTransport,
    integrations(integrations) {
      integrations = integrations.filter((integration) => integration.name !== 'BrowserTracing');
      integrations.push(
        Sentry.browserTracingIntegration({
          shouldCreateSpanForRequest: (url: string) => {
            if (url === GRAPHQL_CLIENT_PROXY_PATH) {
              return false;
            }
            return true;
          },
        })
      );
      integrations.push(
        Sentry.replayIntegration({
          maskAllText: false,
          maskAllInputs: false,
          blockAllMedia: false,
        })
      );
      if (process.env.DEPLOYMENT_TYPE !== 'production') {
        integrations.push(
          Sentry.feedbackIntegration({
            autoInject: false,
          })
        );
      }
      if (spotlightUrl) {
        console.log(`🔦 Initializing Spotlight; streaming events to ${spotlightUrl}`);
        integrations.push(Sentry.spotlightBrowserIntegration({ sidecarUrl: spotlightUrl }));
      }
      return integrations;
    },
  };
  const client = Sentry.init(config);

  if (envToBool(process.env.OTEL_DEBUG, false)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const logger = (require('@common/logging') as typeof logging).getLogger('otel');
    const logSpanEvent = (span: SentrySpan, event: 'Start' | 'End') => {
      const ctx = span.spanContext();
      // @ts-expect-error access private
      const { _name } = span;

      const recording = span.isRecording() ? ' recording' : ' non-recording';

      logger.debug(span, `${event}${event === 'Start' ? recording : ''} span: ${ctx.traceId}:${ctx.spanId} ${_name}`);
    };
    client?.on('spanStart', (span) => {
      // @ts-expect-error access private
      logSpanEvent(span, 'Start');
    });
    client?.on('spanEnd', (span) => {
      // @ts-expect-error access private
      logSpanEvent(span, 'End');
    });
  }

  /*
  if (false &&enableSpotlight) {
    initSpotlight = () => {
      import('@spotlightjs/spotlight')
        .then((Spotlight) => {
          void Spotlight.init({
            sidecarUrl: `${spotlightUrl}/stream`,
          });
        })
        .catch((err) => {
          console.error('Failed to initialize Spotlight', err);
        });
    };
  } else {
    initSpotlight = () => void 0;
  }
  */
  return {
    client,
    initSpotlight: () => void 0,
  };
}
