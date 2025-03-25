import * as Sentry from '@sentry/nextjs';
import type { BaseTransportOptions, SamplingContext } from '@sentry/types';
import type { BrowserOptions } from '@sentry/nextjs';
import type * as logging from '@common/logging';

import { API_SENTRY_TUNNEL_PATH, FAKE_SENTRY_DSN, GRAPHQL_CLIENT_PROXY_PATH } from '@common/constants/routes.mjs';
import { getSpotlightUrl, getSentryTraceSampleRate, getWatchBackendUrl, getPathsBackendUrl, getAssetPrefix } from '@common/env/runtime';
import { envToBool } from '@common/env/utils';
import type { SentrySpan } from '@sentry/core';
import { initRootLogger, getLogger } from '@common/logging/logger';
import type { Logger } from 'pino';

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

const isStaticUrl = (url: string) => {
  if (url.startsWith('/static/')) return true;
  if (url.startsWith('/_next/')) return true;
  const assetPrefix = getAssetPrefix();
  if (assetPrefix) {
    if (url.startsWith(assetPrefix)) return true;
  }
  return false;
};

export function initSentryBrowser() {
  let logger: Logger | undefined;
  const otelDebug = envToBool(process.env.OTEL_DEBUG, false);

  initRootLogger()
    .then(() => logger = getLogger('sentry'))
    .catch(() => void 0);

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
      if (otelDebug) {
        logger?.debug({ctx}, 'tracesSampler');
      }
      if (ctx.parentSampled !== undefined) return ctx.parentSampled;
      return getSentryTraceSampleRate();
    },
    tracePropagationTargets,
    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: envToBool(process.env.SENTRY_DEBUG, false),
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: envToBool(process.env.SENTRY_SESSION_REPLAYS, false) ? 1.0 : 0.0,
    transport: process.env.SENTRY_DSN ? undefined : makeNullTransport,
    integrations(integrations) {
      integrations = integrations.filter((integration) => integration.name !== 'BrowserTracing');
      integrations.push(
        Sentry.browserTracingIntegration({
          shouldCreateSpanForRequest: (url: string) => {
            if (isStaticUrl(url)) return false;

            if (otelDebug) {
              logger?.info({url}, 'shouldCreateSpanForRequest');
            }
            /*
            if (url === GRAPHQL_CLIENT_PROXY_PATH) {
              return false;
            }
            */
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

  if (otelDebug) {
    const logSpanEvent = (span: SentrySpan, event: 'Start' | 'End') => {
      const ctx = span.spanContext();
      // @ts-expect-error access private
      const { _name } = span;

      const recording = span.isRecording() ? ' recording' : ' non-recording';

      logger?.debug(span, `${event}${event === 'Start' ? recording : ''} span: ${ctx.traceId}:${ctx.spanId} ${_name}`);
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
