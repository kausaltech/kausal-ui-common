import * as Sentry from '@sentry/nextjs';
import type { BaseTransportOptions, SamplingContext } from '@sentry/core';
import type { BrowserOptions } from '@sentry/nextjs';

import { API_SENTRY_TUNNEL_PATH, FAKE_SENTRY_DSN, GRAPHQL_CLIENT_PROXY_PATH } from '@common/constants/routes.mjs';
import { getSpotlightUrl, getSentryTraceSampleRate, getWatchBackendUrl, getPathsBackendUrl, getAssetPrefix, getDeploymentType, getSentryRelease } from '@common/env/runtime';
import { envToBool } from '@common/env/utils';
import type { SentrySpan } from '@sentry/core';
import { initRootLogger, getLogger } from '@common/logging/logger';
import type { Logger } from 'pino';
import { isLocal } from '@common/env';

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

let logger: Logger | undefined;

export function initSentryBrowser() {
  const otelDebug = envToBool(process.env.OTEL_DEBUG, false);

  initRootLogger()
    .then(() => {
      logger = getLogger('sentry');
    })
    .catch(() => void 0);

  const spotlightUrl = getSpotlightUrl();
  const tracePropagationTargets: BrowserOptions['tracePropagationTargets'] = [/\/.*/]
  if (getWatchBackendUrl()) {
    tracePropagationTargets.push(getWatchBackendUrl());
  }
  if (getPathsBackendUrl()) {
    tracePropagationTargets.push(getPathsBackendUrl());
  }
  const envDsn = process.env.SENTRY_DSN;
  const dsn = envDsn || (spotlightUrl ? FAKE_SENTRY_DSN : undefined)
  const config: BrowserOptions = {
    environment: getDeploymentType(),
    release: getSentryRelease(),
    dsn,
    tunnel: API_SENTRY_TUNNEL_PATH,
    sendDefaultPii: true,
    enabled: !!(envDsn || spotlightUrl),
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
    transport: envDsn ? undefined : makeNullTransport,
    integrations(integrations) {
      integrations = integrations.filter((integration) => ![Sentry.browserTracingIntegration.name, Sentry.breadcrumbsIntegration.name].includes(integration.name));
      const breadcrumbOpts = isLocal ? {console: false} : {};
      integrations.push(
        Sentry.breadcrumbsIntegration(breadcrumbOpts)
      )
      integrations.push(
        Sentry.browserTracingIntegration({
          idleTimeout: 5000,
          shouldCreateSpanForRequest: (url: string) => {
            if (url === spotlightUrl) {
              return false;
            }
            let decision = true;
            if (isStaticUrl(url)) {
              decision = false;
            }
            if (otelDebug && logger) {
              logger.info({url, decision}, 'shouldCreateSpanForRequest');
            }
            return decision;
          },
        })
      );
      const replay = Sentry.replayIntegration({
        maskAllText: false,
        maskAllInputs: false,
        blockAllMedia: false,
      })
      integrations.push(replay);
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
  if (!client) return;

  if (otelDebug) {
    const logSpanEvent = (span: SentrySpan, event: 'Start' | 'End') => {
      const ctx = span.spanContext();
      // @ts-expect-error access private
      const { _name } = span;
      const recording = span.isRecording() ? ' recording' : ' non-recording';
      logger?.info(span, `${event}${event === 'Start' ? recording : ''} span: ${ctx.traceId}:${ctx.spanId} ${_name}`);
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
}
