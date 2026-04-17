import type { Client } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';

import { getDeploymentRegion } from '@common/env';

export function initSentryCommon(_client: Client) {
  const scope = Sentry.getGlobalScope();
  const region = getDeploymentRegion();
  if (region) {
    scope.setTag('deployment.region', region);
  }
  scope.setTag('runtime', process.env.NEXT_RUNTIME);
}
