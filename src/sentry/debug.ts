import type { Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { ContextManager, Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { SamplingDecision, type SamplingResult } from '@opentelemetry/sdk-trace-base';
import type { ReadableSpan, Span as TraceSpan } from '@opentelemetry/sdk-trace-base';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ATTR_URL_FULL, SEMATTRS_HTTP_URL } from '@opentelemetry/semantic-conventions';
import { spanToJSON } from '@sentry/nextjs';
import { SentryPropagator, SentrySampler } from '@sentry/opentelemetry';
import type { SpanAttributes } from '@sentry/types';
import type { CSPair } from 'ansi-styles';
import styles from 'ansi-styles';

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
  return (
    color.open +
    (underline ? styles.underline.open : '') +
    text +
    (underline ? styles.underline.close : '') +
    color.close
  );
};

const runtimeName = () => {
  const runtime = process.env.NEXT_RUNTIME!;
  let color: CSPair;
  if (runtime === 'edge') {
    color = styles.yellow;
  } else if (runtime === 'nodejs') {
    color = styles.blue;
  } else {
    color = styles.gray;
  }
  return withColor(runtime.toUpperCase().padEnd(10), color);
};

const traceIdColored = (traceId: string) => {
  return withColor(traceId, randomColor(traceId), true);
};

function spanColored(span: Span | undefined) {
  if (!span) return withColor('<no span>', styles.gray);
  const { traceId, spanId } = span.spanContext();
  return `${withColor(traceId, randomColor(traceId), true)}:${withColor(spanId, randomColor(spanId), true)}`;
}

export class DebugSampler extends SentrySampler {
  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: SpanAttributes,
    _links: unknown
  ): SamplingResult {
    const eventName = `${withColor('shouldSample', styles.magenta)}`;
    console.log(
      `${runtimeName()} ${traceIdColored(traceId)} ${eventName} ${spanKindToName(spanKind)} ${spanName}`
    );
    const attributesString =
      attributes && Object.keys(attributes).length > 0 ? JSON.stringify(attributes) : null;
    if (attributesString) {
      console.log(`  attributes: ${attributesString}`);
    }
    if (attributes && attributes['user_agent.original'] === 'Next.js Middleware') debugger;
    const ret = super.shouldSample(context, traceId, spanName, spanKind, attributes, _links);
    const traceState = ret.traceState?.serialize() || 'none';
    const decisionAttributes = ret.attributes ? JSON.stringify(ret.attributes) : 'none';
    console.log(
      `${runtimeName()} ${traceIdColored(traceId)} ${eventName} decision ${decisionToName(ret.decision)} <traceState: ${traceState}> <attributes: ${decisionAttributes}>`
    );
    return ret;
  }
}
export class DebugSpanProcessor implements SpanProcessor {
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
  onStart(span: TraceSpan, _parentContext: Context): void {
    console.log(
      `${runtimeName()} ${spanColored(span)} ${withColor('onStart', styles.greenBright)} ${span.isRecording()} ${withColor(span.name, styles.blue)}  ${spanKindToName(span.kind)}`
    );
    console.log(`  attributes: ${JSON.stringify(span.attributes)}`);
    //if (process.env.NEXT_RUNTIME === 'edge') debugger;
  }
  onEnd(span: TraceSpan & ReadableSpan): void {
    console.log(
      `${runtimeName()} ${spanColored(span)} ${withColor('onEnd', styles.green)} ${span.name}`
    );
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const SENTRY_TRACE_STATE_URL = 'sentry.url';

function getCurrentURL(span: Span): string | undefined {
  const spanData = spanToJSON(span).data;
  // `ATTR_URL_FULL` is the new attribute, but we still support the old one, `SEMATTRS_HTTP_URL`, for now.
  const urlAttribute = (spanData?.[SEMATTRS_HTTP_URL] || spanData?.[ATTR_URL_FULL]) as string | undefined;
  if (urlAttribute) {
    return urlAttribute;
  }

  // Also look at the traceState, which we may set in the sampler even for unsampled spans
  const urlTraceState = span.spanContext().traceState?.get(SENTRY_TRACE_STATE_URL);
  if (urlTraceState) {
    return urlTraceState;
  }

  return undefined;
}

export class DebugPropagator extends SentryPropagator {
  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const activeSpan = trace.getSpan(context);
    const url = activeSpan && getCurrentURL(activeSpan);

    console.log(
      `${runtimeName()} ${spanColored(activeSpan)} ${withColor('inject', styles.cyan)} ${
        url ? `url: ${url}` : ''
      }`
    );
    super.inject(context, carrier, setter);
  }
  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    console.log(`${runtimeName()} ${withColor('extract', styles.cyan)}`);
    //debugger;
    return super.extract(context, carrier, getter);
  }
}

export function getDebugContextManager<ContextManagerInstance extends ContextManager>(
  _ContextManagerClass: new (...args: unknown[]) => ContextManagerInstance
): typeof _ContextManagerClass {
  // @ts-expect-error TS does not like this, but we know this is fine
  class DebugContextManager extends _ContextManagerClass {
    with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
      context: Context,
      fn: F,
      thisArg?: ThisParameterType<F>,
      ...args: A
    ): ReturnType<F> {
      const span = trace.getSpan(context);
      console.log(`${runtimeName()} ${withColor('with', styles.cyan)} ${spanColored(span)}`);
      return super.with(context, fn, thisArg, ...args);
    }
  }
  return DebugContextManager as unknown as typeof _ContextManagerClass;
}
