/* istanbul ignore file */
import otel from '@opentelemetry/api';
import type { LoggerOptions as PinoLoggerOptions, pino } from 'pino';

export const LOGGER_TRACE_ID = 'trace-id';
export const LOGGER_SPAN_ID = 'span-id';

export function getGlobalContext() {
  return {
    runtime: typeof window !== 'undefined' ? 'browser' : process.env.NEXT_RUNTIME,
  };
}

export function getSpanContext() {
  const span = otel.trace.getActiveSpan();
  if (!span) return {};
  return {
    [LOGGER_TRACE_ID]: span.spanContext().traceId,
    [LOGGER_SPAN_ID]: span.spanContext().spanId,
  };
}

function addDynamicGlobalAttributes(_mergeObject: object, _level: number, logger: pino.Logger) {
  const attrs = {
    ...(!logger['noSpan'] ? getSpanContext() : {}),
  };
  return attrs;
}

export function getRootLoggerOptions() {
  const isProd = (process.env.NODE_ENV || 'development') == 'production';
  const logLevel = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');
  const options: PinoLoggerOptions = {
    level: logLevel,
    formatters: {},
    mixin: addDynamicGlobalAttributes,
    mixinMergeStrategy(mergeObject, mixinObject) {
      const out = { ...mixinObject, ...mergeObject };
      return out;
    },
  };
  options.formatters!.level = (label, _number) => ({ level: label });
  return options;
}
