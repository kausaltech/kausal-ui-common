import * as api from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { ExportResult } from '@opentelemetry/core';
//import { resourceFromAttributes } from '@opentelemetry/resources';
import { Resource } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
  wrapContextManagerClass,
} from '@sentry/opentelemetry';
import type { VercelEdgeClient } from '@sentry/vercel-edge';

import { getBuildId } from '@common/env/runtime';
import { getProjectId } from '@common/env/static';
import { envToBool } from '@common/env/utils';
import { initEdgeRootLogger } from '@common/logging/edge';
import { DebugSentrySpanProcessor } from '@common/sentry/debug';
import { initSentry } from '@common/sentry/server-init';

class _NullSpanExporter implements SpanExporter {
  export(_spans: ReadableSpan[], _resultCallback: (result: ExportResult) => void): void {
    return;
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export function initEdgeLogging() {
  initEdgeRootLogger();
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function initTelemetry(sentryClient: VercelEdgeClient) {
  const otelDebug = envToBool(process.env.OTEL_DEBUG, false);
  const processorOpts = { timeout: sentryClient.getOptions().maxSpanWaitDuration };
  const spanProcessors: SpanProcessor[] = [new SentrySpanProcessor(processorOpts)];
  if (otelDebug) {
    spanProcessors.push(new DebugSentrySpanProcessor());
  }
  const propagator = new SentryPropagator();
  const traceSampler = new SentrySampler(sentryClient);
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: getProjectId(),
    [ATTR_SERVICE_VERSION]: getBuildId(),
  });
  /*
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: getProjectId(),
    [ATTR_SERVICE_VERSION]: getBuildId(),
  });
  */
  const provider = new BasicTracerProvider({
    resource,
    spanProcessors,
    sampler: traceSampler,
    forceFlushTimeoutMillis: 500,
  });
  const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);
  api.context.setGlobalContextManager(new SentryContextManager());
  api.trace.setGlobalTracerProvider(provider);
  api.propagation.setGlobalPropagator(propagator);
}

export async function initAll(_productName: string) {
  initEdgeLogging();
  const sentryClient = await initSentry();
  await initTelemetry(sentryClient as VercelEdgeClient);
}
