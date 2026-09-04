/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Client } from '@sentry/core';
import { consoleSandbox, debug as sentryDebug } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

import { getDeploymentRegion } from '@common/env';
import { getLogger } from '@common/logging';

function configureSentryDebugLogger() {
  if (sentryDebug.isEnabled()) {
    const logger = getLogger({
      name: 'sentry',
    });
    ['error', 'log', 'warn'].forEach(
      (level) =>
        (sentryDebug[level] = (...args: Parameters<typeof sentryDebug.log>) =>
          consoleSandbox(() => {
            const [msg, ...rest] = args;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            logger[level](msg, ...rest);
          }))
    );
  }
}

export function initSentryCommon(_client: Client) {
  const scope = Sentry.getGlobalScope();
  const region = getDeploymentRegion();
  if (region) {
    scope.setTag('deployment.region', region);
  }
  scope.setTag(
    'runtime',
    typeof window !== 'undefined' ? 'browser' : (process.env.NEXT_RUNTIME ?? 'node')
  );
  configureSentryDebugLogger();
}
