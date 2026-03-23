/* istanbul ignore file */
import otel from '@opentelemetry/api';
import type { Logger, LoggerOptions as PinoLoggerOptions } from 'pino';

import { isLocalDev } from '@common/env';

export const LOGGER_TRACE_ID = 'trace-id';
export const LOGGER_SPAN_ID = 'span-id';

export function getGlobalContext() {
  return {
    runtime: typeof window !== 'undefined' ? 'browser' : process.env.NEXT_RUNTIME,
  };
}

export function getTraceLogBindings() {
  const span = otel.trace.getActiveSpan();
  if (!span) return {};

  function formatId(id: string) {
    if (isLocalDev) {
      return id.substring(0, 8);
    }
    return id;
  }

  const spanContext = span.spanContext();
  const { traceId, spanId } = spanContext;
  if (!traceId || new Set(traceId).size === 1) {
    // traceid of only zeroes, skip logging
    return {};
  }
  return {
    [LOGGER_TRACE_ID]: formatId(traceId),
    [LOGGER_SPAN_ID]: formatId(spanId),
  };
}

function addDynamicGlobalAttributes(_mergeObject: object, _level: number, logger: Logger) {
  const attrs = {
    ...(!logger['noSpan'] ? getTraceLogBindings() : {}),
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
