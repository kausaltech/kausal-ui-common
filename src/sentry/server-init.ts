import { context, propagation } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { serializeEnvelope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import { type EdgeOptions, type NodeOptions, } from '@sentry/nextjs';
import type { httpIntegration, nativeNodeFetchIntegration } from '@sentry/node';
import type { BaseTransportOptions, Client, Envelope, IntegrationFn, Options, SamplingContext, Span } from '@sentry/core';
import type { Logger } from 'pino';

import { API_SENTRY_TUNNEL_PATH, FAKE_SENTRY_DSN, GRAPHQL_CLIENT_PROXY_PATH, HEALTH_CHECK_PUBLIC_PATH, SENTRY_TUNNEL_PUBLIC_PATH } from '@common/constants/routes.mjs';
import { getPathsGraphQLUrl, getRuntimeConfig, getSentryRelease, getSentryTraceSampleRate, getSpotlightUrl, getWatchGraphQLUrl } from '@common/env';
import { envToBool } from '@common/env/utils';
import { getLogger } from '@common/logging/logger';
import { ensureTrailingSlash } from '@common/utils';


const IGNORE_PATHS = [
  SENTRY_TUNNEL_PUBLIC_PATH,
  HEALTH_CHECK_PUBLIC_PATH,
  API_SENTRY_TUNNEL_PATH,
  '/__nextjs_original-stack-frame',
  '/__nextjs_source-map',
  '/icon.png',
];
const IGNORE_PREFIXES = ['/static', '/_next', '/public', '/images', '/fonts'].map(ensureTrailingSlash);

let logger: Logger;

/**
 * Returns the URL to use for Spotlight UI, or null if Spotlight is not enabled.
 */
export function getSpotlightViewUrl() {
  const spotlightUrl = getSpotlightUrl();
  if (!spotlightUrl) return null;
  return spotlightUrl.replace('/stream', '');
}

const edgeSpotlightIntegration: IntegrationFn = (options: { url: string }) => {
  let nrErrors = 0;

  const sendEnvelope = (client: Client, envelope: Envelope) => {
    const serializedEnvelope = serializeEnvelope(envelope);
    if (nrErrors > 5) {
      return;
    }
    fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      body: serializedEnvelope,
    }).catch((reason: Error) => {
      nrErrors++;
      const cause = 'cause' in reason ? reason.cause : undefined;
      let errorMessage = reason.message;
      if (cause instanceof Error) {
        errorMessage = cause.message;
      } else {
        errorMessage = reason.message;
      }
      logger.warn(`Error sending envelope to Spotlight: ${errorMessage}`);
      if (nrErrors >= 5) {
        logger.warn('Too many errors sending envelopes to Spotlight, disabling integration');
      }
    });
  };

  return {
    name: 'EdgeSpotlight',
    setup(_client) {},
    afterAllSetup(client) {
      client.on('beforeEnvelope', (envelope: Envelope) => sendEnvelope(client, envelope));
    },
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeNullTransport(options: BaseTransportOptions) {
  return Sentry.createTransport(
    {
      recordDroppedEvent: () => {},
    },
    (_request) => {
      return Promise.resolve({});
    }
  );
}

function getCommonOptions() {
  const runtimeConfig = getRuntimeConfig();
  /*
  const backendHost = new URL(runtimeConfig.apiUrl).hostname;
  const tracePropagationTargets = [matchAnyPath(backendHost)];
  if (isLocal) {
    tracePropagationTargets.push(matchAnyPath('localhost'));
  }
  */
  const spotlightUrl = getSpotlightUrl();
  const enableSpotlight = !!spotlightUrl;
  const runtime = process.env.NEXT_RUNTIME;
  const environment =
    runtimeConfig.deploymentType === 'development'
      ? `development-${runtime}`
      : runtimeConfig.deploymentType;

  return {
    // If we're using Spotlight, we need to set a fake DSN so that trace propagation works.
    dsn: runtimeConfig.sentryDsn ?? (enableSpotlight ? FAKE_SENTRY_DSN : undefined),
    environment,
    release: getSentryRelease(),
    enabled: enableSpotlight ? true : undefined,
    // If we're using Spotlight, and a DSN is not set, we need to create a fake transport so that tracing works.
    transport: runtimeConfig.sentryDsn || !enableSpotlight ? undefined : makeNullTransport,
    tracesSampler(ctx: SamplingContext) {
      const transactionPrefix = process.env.NEXT_RUNTIME === 'edge' ? 'middleware ' : '';

      const matchesVerb = (verb: 'GET' | 'POST', path: string) =>
        ctx.name == `${transactionPrefix}${verb} ${path}`;
      if (
        matchesVerb('GET', GRAPHQL_CLIENT_PROXY_PATH) ||
        matchesVerb('POST', GRAPHQL_CLIENT_PROXY_PATH) ||
        matchesVerb('POST', API_SENTRY_TUNNEL_PATH)
      ) {
        return false;
      }

      if (IGNORE_PATHS.some((path) => matchesVerb('GET', path))) {
        return false;
      }
      if (
        IGNORE_PREFIXES.some((prefix) => {
          if (ctx.name.startsWith(`${transactionPrefix}GET ${prefix}`)) {
            return true;
          }
        })
      ) {
        return false;
      }
      if (ctx.parentSampled !== undefined) return ctx.parentSampled;
      if (ctx.name === 'start response') {
        // If the parent transaction is not sampled, we don't want to sample this one.
        return false;
      }
      return getSentryTraceSampleRate();
    },
    ignoreErrors: ['NEXT_NOT_FOUND'],
    debug: envToBool(process.env.SENTRY_DEBUG, false),
  } satisfies Options;
}

type NodeFetchOptions = Parameters<typeof nativeNodeFetchIntegration>[0];

function shouldIgnoreOutgoingRequest(url: string) {
  const spotlightUrl = getSpotlightUrl();
  if (spotlightUrl && url === spotlightUrl) {
    return true;
  }
  // GraphQL requests are instrumented separately.
  if (url === getWatchGraphQLUrl() || url === getPathsGraphQLUrl()) {
    return true;
  }
  return false;
}

function getNodeFetchIntegrationOptions(): NodeFetchOptions {
  const options: NodeFetchOptions = {
    ignoreOutgoingRequests: shouldIgnoreOutgoingRequest,
  };
  return options;
}

const otelDebug = envToBool(process.env.OTEL_DEBUG, false);

type HttpIntegrationOptions = Parameters<typeof httpIntegration>[0];
type HttpInstrumentationOptions = NonNullable<NonNullable<HttpIntegrationOptions>['instrumentation']>['_experimentalConfig'];


export function getHttpInstrumentationOptions(): HttpInstrumentationOptions {
  const logger = getLogger('http-instrumentation', { noSpan: true });
  const options: HttpInstrumentationOptions = {
    enabled: true,
    ignoreIncomingRequestHook(request) {
      const urlPath = request.url?.split('?')[0] ?? '';
      if (IGNORE_PATHS.some((path) => urlPath === path)) {
        return true;
      }
      if (IGNORE_PREFIXES.some((prefix) => urlPath.startsWith(prefix))) {
        return true;
      }
      if (otelDebug) {
        logger.info({ urlPath }, `incoming request not ignored`);
      }
      return false;
    },
    ignoreOutgoingRequestHook(request) {
      const spotlightUrl = getSpotlightUrl();
      if (spotlightUrl) {
        // Something weird is going on with the url argument, so we'll use
        // the request object instead.
        const spUrl = new URL(spotlightUrl);
        if (
          request.hostname === spUrl.hostname &&
          request.port === spUrl.port &&
          request.path === spUrl.pathname
        ) {
          return true;
        }
      }
      return false;
    },
    requestHook: (span: Span, request) => {
      if (!('headers' in request)) {
        return;
      }
      const { headers } = request;
      const existingPropagationHeaders = propagation
        .fields()
        .filter((header) => header.toLowerCase() in headers)
        .map((header) => [header, headers[header.toLowerCase()]]);
      if (existingPropagationHeaders.length > 0) {
        if (otelDebug) {
          logger.info(
            { ...Object.fromEntries(existingPropagationHeaders) },
            'propagation headers already present, skipping'
          );
        }
        return;
      }
      if (otelDebug) {
        const span = trace.getSpan(context.active());
        const spanContext = span?.spanContext();
        logger.info(
          { 'trace-id': spanContext?.traceId, 'span-id': spanContext?.spanId },
          'injecting propagation headers'
        );
      }
      propagation.inject(context.active(), headers);
    },
  };
  return options;
}

function getNodeOptions() {
  // We require() the Sentry module here to avoid an edge runtime build error.
  const SentryModule = require('@sentry/nextjs') as typeof Sentry;
  const customizedIntegrations = [
    SentryModule.httpIntegration({spans: false}),
    SentryModule.nativeNodeFetchIntegration(getNodeFetchIntegrationOptions()),
  ];
  return {
    ...getCommonOptions(),
    skipOpenTelemetrySetup: true,
    registerEsmLoaderHooks: true,
    spotlight: getSpotlightUrl() || undefined,
    integrations: (integrations) => {
      const filtered = integrations
        .filter((integration) => {
          if (['Graphql', 'Http', 'NodeFetch'].includes(integration.name)) {
            return false;
          }
          return true;
        })
        .concat(customizedIntegrations);
      return filtered;
    },
  } satisfies NodeOptions;
}

function getEdgeOptions() {
  const spotlightUrl = getSpotlightUrl();
  return {
    ...getCommonOptions(),
    //tracePropagationTargets: [],
    integrations: (integrations) => {
      integrations = integrations.filter((integrations) => integrations.name !== 'WinterCGFetch');
      /*.concat(
          winterCGFetchIntegration({
            shouldCreateSpanForRequest: (url) => {
              return !shouldIgnoreOutgoingRequest(url);
            },
          })
        )*/

      if (spotlightUrl) {
        integrations.push(edgeSpotlightIntegration({ url: spotlightUrl }));
      }
      return integrations;
    },
  } satisfies EdgeOptions;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function initSentry(): Promise<Client | undefined> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(getEdgeOptions());
  } else {
    Sentry.init(getNodeOptions());
  }
  logger = getLogger('sentry');
  return Sentry.getClient();
}
