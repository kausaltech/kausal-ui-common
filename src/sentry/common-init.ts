import type { Client } from '@sentry/core';
import { consoleSandbox, debug as sentryDebug } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import type { Level } from 'pino';

import { getDeploymentRegion } from '@common/env';
import { getLogger } from '@common/logging';

/**
 * Sentry's debug logger speaks console levels; pino has no `log`, so map it to
 * `info` rather than indexing the logger with a level it doesn't implement.
 */
const PINO_LEVEL_BY_SENTRY_LEVEL = {
  error: 'error',
  log: 'info',
  warn: 'warn',
} as const satisfies Record<string, Level>;

type SentryDebugLevel = keyof typeof PINO_LEVEL_BY_SENTRY_LEVEL;

function configureSentryDebugLogger() {
  if (!sentryDebug.isEnabled()) return;

  const logger = getLogger({
    name: 'sentry',
  });
  const levels = Object.keys(PINO_LEVEL_BY_SENTRY_LEVEL) as SentryDebugLevel[];
  for (const level of levels) {
    const pinoLevel = PINO_LEVEL_BY_SENTRY_LEVEL[level];
    sentryDebug[level] = (...args: unknown[]) =>
      consoleSandbox(() => {
        // Sentry's debug logger is console-shaped: a message followed by
        // arbitrary extras. Pino wants the extras as a binding object instead.
        const [first, ...rest] = args;
        const msg = typeof first === 'string' ? first : undefined;
        const extras = msg === undefined ? args : rest;
        if (extras.length > 0) {
          logger[pinoLevel]({ args: extras }, msg);
        } else {
          logger[pinoLevel](msg ?? '');
        }
      });
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
