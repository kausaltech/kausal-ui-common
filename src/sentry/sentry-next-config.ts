import { createRequire } from 'node:module';

import type * as Sentry from '@sentry/nextjs';
import type { SentryBuildOptions } from '@sentry/nextjs';
import { secrets } from 'docker-secret';
import type { NextConfig } from 'next';

import { getSpotlightUrl } from '../env/runtime';

import {
  API_HEALTH_CHECK_PATH,
  API_SENTRY_TUNNEL_PATH,
  HEALTH_CHECK_PUBLIC_PATH,
  SENTRY_TUNNEL_PUBLIC_PATH,
} from '../constants/routes.mjs';
import { envToBool } from '../env/utils';

const sentryAuthToken = secrets.SENTRY_AUTH_TOKEN || process.env.SENTRY_AUTH_TOKEN;

const sentryDebug = envToBool(process.env.SENTRY_DEBUG, false);

export function wrapWithSentryConfig(configIn: NextConfig): NextConfig {
  const require = createRequire(import.meta.url);
  const { withSentryConfig } = require('@sentry/nextjs') as typeof Sentry;
  const uploadEnabled = !!sentryAuthToken;

  const sentryConfig: SentryBuildOptions = {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
    authToken: sentryAuthToken,
    silent: !sentryDebug && !uploadEnabled,

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: uploadEnabled,

    // Disable the built-in tunnel route, because it only works with Sentry.io anyway.
    tunnelRoute: undefined,

    // Hides source maps from generated client bundles
    bundleSizeOptimizations: {
      excludeDebugStatements: !sentryDebug,
      excludeReplayIframe: true,
    },
    reactComponentAnnotation: {
      enabled: true,
    },
    telemetry: false,
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: !sentryDebug,
    excludeServerRoutes: [
      API_HEALTH_CHECK_PATH,
      HEALTH_CHECK_PUBLIC_PATH,
      API_SENTRY_TUNNEL_PATH,
      SENTRY_TUNNEL_PUBLIC_PATH,
    ],
    automaticVercelMonitors: false,
    autoInstrumentMiddleware: false,
    autoInstrumentServerFunctions: false,
    sourcemaps: {
      deleteSourcemapsAfterUpload: false,
    },
    release: {
      create: uploadEnabled,
    },
  };
  return withSentryConfig(configIn, sentryConfig);
}

export function getSentryWebpackDefines(stringify: boolean = true): Record<string, string> {
  const defines: Record<string, string> = {};
  function setIfDefined(key: string, value: string | undefined) {
    if (!value) return;
    defines[`process.env.${key}`] = stringify ? JSON.stringify(value) : value;
  }
  const sentryDsnPlaceholder = process.env.SENTRY_DSN_PLACEHOLDER;
  const sentryDsn = process.env.SENTRY_DSN;
  const spotlightUrl = getSpotlightUrl();
  setIfDefined('SENTRY_DSN', sentryDsnPlaceholder ?? sentryDsn);
  setIfDefined('SENTRY_DEBUG', sentryDebug ? '1' : '0');
  setIfDefined('SENTRY_SPOTLIGHT', spotlightUrl ? spotlightUrl : '0');
  setIfDefined('OTEL_DEBUG', envToBool(process.env.OTEL_DEBUG, false) ? '1' : '0');
  setIfDefined('SENTRY_SESSION_REPLAYS', envToBool(process.env.SENTRY_SESSION_REPLAYS, false) ? '1' : '0');
  return defines;
}
