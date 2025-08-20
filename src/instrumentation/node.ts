import { type Context, DiagConsoleLogger, DiagLogLevel, type Span, diag } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { type ReadableSpan, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import * as Sentry from '@sentry/node';
import type { NodeClient } from '@sentry/node';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';

import { getBuildId, getProjectId, printRuntimeConfig } from '@common/env';
import { envToBool } from '@common/env/utils';
import { getLogger } from '@common/logging';
import { initNodeRootLogger } from '@common/logging/node';
import { DebugPropagator, DebugSampler, DebugSentrySpanProcessor } from '@common/sentry/debug';
import {
  getHttpInstrumentationOptions,
  getSpotlightViewUrl,
  initSentry,
} from '@common/sentry/server-init';

function initDebugLogging() {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);
}

export function initNodeLogging() {
  initNodeRootLogger();
}

class GeneralSpanProcessor implements SpanProcessor {
  onStart(_span: Span, _parentContext: Context): void {}
  onEnd(span: ReadableSpan): void {
    if (
      span.attributes['sentry.sentry_trace_backfill'] &&
      span.attributes['http.method'] &&
      !span.parentSpanContext
    ) {
      delete span.attributes['sentry.sentry_trace_backfill'];
    }
  }
  forceFlush(): Promise<void> {
    return new Promise(() => void 0);
  }
  shutdown(): Promise<void> {
    return new Promise(() => void 0);
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function initTelemetry(sentryClient: NodeClient) {
  const otelDebug = envToBool(process.env.OTEL_DEBUG, false);
  const otelDebugLogging = envToBool(process.env.OTEL_DEBUG_LOGGING, false);
  if (otelDebugLogging) {
    initDebugLogging();
  }
  const traceSampler = otelDebug ? new DebugSampler(sentryClient) : new SentrySampler(sentryClient);
  const propagator = otelDebug ? new DebugPropagator() : new SentryPropagator();
  const processorOpts = {
    timeout: sentryClient.getOptions().maxSpanWaitDuration,
  };
  const spanProcessors: SpanProcessor[] = [];
  spanProcessors.push(new GeneralSpanProcessor());
  if (otelDebug) {
    spanProcessors.push(new DebugSentrySpanProcessor(processorOpts));
  } else {
    const sentrySpanProcessor = new SentrySpanProcessor(processorOpts);
    spanProcessors.push(sentrySpanProcessor);
  }
  const provider = new NodeTracerProvider({
    // Ensure the correct subset of traces is sent to Sentry
    // This also ensures trace propagation works as expected
    sampler: traceSampler,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: getProjectId(),
      [ATTR_SERVICE_VERSION]: getBuildId(),
    }),
    spanProcessors,
  });
  const contextManager = new Sentry.SentryContextManager();
  provider.register({
    // Ensure trace propagation works
    // This relies on the SentrySampler for correct propagation
    propagator,
    // Ensure context & request isolation are correctly managed
    contextManager,
  });
  const httpOptions = getHttpInstrumentationOptions();
  const httpInstrumentation = new HttpInstrumentation(httpOptions);
  registerInstrumentations({
    instrumentations: [httpInstrumentation],
  });
  Sentry.validateOpenTelemetrySetup();
  // This is a hack to force the http module to be instrumented
  require('http');
}

export async function initMetrics() {
  /*
  const metricsPort = process.env.METRICS_PORT ? Number(process.env.METRICS_PORT) : 9464;

  //const exporter = new PrometheusExporter({
  //  port: metricsPort,
  //});
  const detectedResources = detectResourcesSync({
    detectors: [envDetector, processDetector, hostDetector],
  });

  const customResources = new Resource({
    [ATTR_SERVICE_NAME]: getProjectId(),
    [ATTR_SERVICE_VERSION]: getBuildId(),
  });

  const resources = detectedResources.merge(customResources);

  const meterProvider = new MeterProvider({
    //readers: [exporter],
    resource: resources,
  });
  const hostMetrics = new HostMetrics({
      name: process.env.SENTRY_PROJECT!,
      meterProvider,
  });
  registerInstrumentations({
    meterProvider,
    instrumentations: [],
  });

  console.log(`Prometheus metrics served at :${metricsPort}`);
  */
}

export async function initAll(productName: string) {
  printRuntimeConfig(productName);
  const spotlightUrl = getSpotlightViewUrl();
  const nodeOtel = await import('@common/instrumentation/node');
  nodeOtel.initNodeLogging();
  const logger = getLogger('init');
  const sentryClient = await initSentry();
  if (spotlightUrl && sentryClient) {
    logger.info(
      { release: sentryClient.getOptions().release },
      `🔦 Sentry Spotlight enabled at: ${spotlightUrl}`
    );
  }
  await nodeOtel.initTelemetry(sentryClient as NodeClient);
}
