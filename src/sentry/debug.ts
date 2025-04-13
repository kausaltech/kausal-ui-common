import type { Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { SamplingDecision, type SamplingResult } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_URL_FULL, SEMATTRS_HTTP_TARGET, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { spanToJSON } from '@sentry/nextjs';
import { SentryPropagator, SentrySampler } from '@sentry/opentelemetry';
import type { Client, SpanAttributes } from '@sentry/core';
import type { CSPair } from 'ansi-styles';
import styles from 'ansi-styles';
import type { Logger } from 'pino';

import { getLogger as getUpstreamLogger } from '@common/logging';
import { isPrettyLogger } from '@common/logging/logger';


function getLogger(name: string) {
  const logger = getUpstreamLogger({ name, noSpan: true });
  return logger;
}

const PALETTE = [
  '#db5f57',
  '#dbc257',
  '#91db57',
  '#57db80',
  '#57d3db',
  '#5770db',
  '#a157db',
  '#db57b2',
];

function simpleHash(s: string): number {
  let val = 0;
  for (const char of s) {
    val = (val << 5) - val + char.charCodeAt(0);
    val |= 0;
  }
  return val >>> 0;
}

function randomColor(s: string): CSPair {
  const hash = simpleHash(s);
  const hexColor = PALETTE[hash % PALETTE.length];
  const color = styles.color.ansi16m.hex(hexColor);
  return {
    open: color,
    close: styles.color.close,
  };
}

const spanKindToName = (kind: SpanKind) => {
  let kindName: string;
  switch (kind) {
    case SpanKind.CLIENT:
      kindName = 'client';
      break;
    case SpanKind.SERVER:
      kindName = 'server';
      break;
    case SpanKind.INTERNAL:
      kindName = 'internal';
      break;
    case SpanKind.PRODUCER:
      kindName = 'producer';
      break;
    case SpanKind.CONSUMER:
      kindName = 'consumer';
      break;
    default:
      kindName = 'unknown';
  }
  return withColor(kindName, styles.magenta);
};

const decisionToName = (decision: SamplingDecision) => {
  switch (decision) {
    case SamplingDecision.NOT_RECORD:
      return styles.red.open + 'NOT_RECORD' + styles.reset.close;
    case SamplingDecision.RECORD:
      return styles.yellow.open + 'RECORD' + styles.reset.close;
    case SamplingDecision.RECORD_AND_SAMPLED:
      return styles.green.open + 'RECORD_AND_SAMPLED' + styles.reset.close;
  }
};

const withColor = (text: string, color: CSPair, underline: boolean = false) => {
  if (!isPrettyLogger()) {
    return text;
  }
  return (
    color.open +
    (underline ? styles.underline.open : '') +
    text +
    (underline ? styles.underline.close : '') +
    color.close
  );
};

const traceIdColored = (traceId: string) => {
  return withColor(traceId, randomColor(traceId), true);
};

function spanNameColored(name: string) {
  return `[${withColor(name, styles.blue)}]`;
}

function spanColored(span: ReadableSpan | undefined) {
  if (!span) return withColor('<no span>', styles.gray);
  const { traceId, spanId } = span.spanContext();
  return `${traceIdColored(traceId)}:${withColor(spanId, randomColor(spanId), true)} ${spanNameColored(span.name)}`;
}

export class DebugSampler extends SentrySampler {
  private readonly logger: Logger;

  constructor(client: Client) {
    super(client);
    this.logger = getLogger('debug-sampler');
  }
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: SpanAttributes,
    _links: unknown
  ): SamplingResult {
    const eventName = `${withColor('shouldSample', styles.magenta)}`;
    const logBase = `${traceIdColored(traceId)} ${spanNameColored(spanName)}`;
    this.logger.info(
      {...attributes}, `${logBase} ${spanKindToName(spanKind)} ${eventName}`
    );
    const ret = super.shouldSample(context, traceId, spanName, spanKind, attributes, _links);
    const traceState = ret.traceState?.serialize() || 'none';
    const decisionAttributes = ret.attributes ? JSON.stringify(ret.attributes) : 'none';
    this.logger.info(
      `${logBase} decision ${decisionToName(ret.decision)} <traceState: ${traceState}> <attributes: ${decisionAttributes}>`
    );
    return ret;
  }
}
export class DebugSpanProcessor implements SpanProcessor {
  private readonly logger: Logger;

  constructor() {
    this.logger = getLogger('span-processor');
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  onStart(span_: Span, _parentContext: Context): void {
    const span = span_ as unknown as ReadableSpan;
    this.logger.info(
      {recording: span_.isRecording(), ...span.attributes}, `${spanColored(span)} ${withColor('onStart', styles.greenBright)} ${spanKindToName(span.kind)}`
    );
  }
  onEnd(span: ReadableSpan): void {
    this.logger.info(
      `${spanColored(span)} ${withColor('onEnd', styles.green)}`
    );
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const SENTRY_TRACE_STATE_URL = 'sentry.url';

function getCurrentURL(span: Span): string | undefined {
  const data = spanToJSON(span).data;
  // `ATTR_URL_FULL` is the new attribute, but we still support the old one, `SEMATTRS_HTTP_URL`, for now.
  if (data) {
    const urlAttribute = data[SEMATTRS_HTTP_URL] || data[ATTR_URL_FULL] || data[SEMATTRS_HTTP_TARGET];
    if (urlAttribute) return urlAttribute as string;
  }
  // Also look at the traceState, which we may set in the sampler even for unsampled spans
  const urlTraceState = span.spanContext().traceState?.get(SENTRY_TRACE_STATE_URL);
  if (urlTraceState) {
    return urlTraceState;
  }

  return undefined;
}

export class DebugPropagator extends SentryPropagator {
  private readonly logger: Logger;

  constructor() {
    super();
    this.logger = getLogger('propagator');
  }
  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const activeSpan = trace.getSpan(context);
    const url = activeSpan && getCurrentURL(activeSpan);
    this.logger.info(
      {url}, `${spanColored(activeSpan as unknown as ReadableSpan)} ${withColor('inject', styles.cyan)} ${
        url ? `url: ${url}` : ''
      }`
    );
    super.inject(context, carrier, setter);
  }
  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const ret = super.extract(context, carrier, getter);
    const activeSpan = trace.getSpan(ret);
    this.logger.info(
      `${spanColored(activeSpan as unknown as ReadableSpan)} ${withColor('extracted', styles.cyan)}`
    );
    return ret;
  }
}
