import { REQUEST_CORRELATION_ID_HEADER } from '../constants/headers.mjs';
import { customAlphabet } from 'nanoid';
import type { IncomingHttpHeaders } from 'node:http';
import type { Bindings, DestinationStream, Level, Logger, LoggerOptions as PinoLoggerOptions, WriteFn } from 'pino';
import otel from '@opentelemetry/api';
import { pino } from 'pino';
import { envToBool } from '../env/utils';


let rootLogger: Logger;

export type LogRecord = {
  runtime: 'edge' | 'nodejs' | 'browser';
  time: number;
  level: Level;
  msg?: string;
  logger?: string;
  pid?: number;
  hostname?: string;
  noSpan?: boolean;
  [key: string]: unknown;
};

function setupEdgeLoggingJson(options: PinoLoggerOptions) {
  const write: WriteFn = (obj: LogRecord) => {
    const { time, level, ...rest } = obj;
    const rec = {
      level,
      time: new Date(time).toISOString(),
      ...rest,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const logFunc = console[level] || console.log;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      logFunc(JSON.stringify(rec));
    } catch (err) {
      if (err instanceof Error) {
        // Without a `replacer` argument, stringify on Error results in `{}`
        console.log(JSON.stringify(err, ['name', 'message', 'stack']));
      } else {
        console.log(JSON.stringify({ message: 'Unknown error type' }));
      }
    }
  };
  options.browser = {
    formatters: {
      level: options.formatters!.level,
    },
    write,
  };
}

export function isPrettyLogger() {
  if (process.env.NODE_ENV === 'production') return false;
  if (envToBool(process.env.KUBERNETES_LOGGING, false)) return false;
  return true;
}

function getGlobalContext() {
  return {
    runtime: typeof window !== 'undefined' ? 'browser' : process.env.NEXT_RUNTIME,
  };
}

function getSpanContext() {
  const span = otel.trace.getActiveSpan();
  if (!span) return {};
  return {
    [LOGGER_TRACE_ID]: span.spanContext().traceId,
    [LOGGER_SPAN_ID]: span.spanContext().spanId,
  };
}

function addDynamicGlobalAttributes(_mergeObject: object, _level: number, logger: pino.Logger) {
  const attrs = {
    ...(!logger['noSpan'] ? getSpanContext(): {}),
  }
  return attrs;
}

export async function initRootLogger() {
  if (rootLogger) {
    return rootLogger;
  }
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

  const prodLogging = !isPrettyLogger();
  let stream: DestinationStream | undefined;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (prodLogging) {
      // Default options are fine.
      options.timestamp = () => `,"time":"${new Date(Date.now()).toISOString()}"`;
    } else {
      const { setupNodeLogging } = await import('./pretty-node-logger');
      stream = await setupNodeLogging(options);
    }
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    if (prodLogging) {
      setupEdgeLoggingJson(options);
    } else {
      const { setupEdgeLogging } = await import('./chalk-logger');
      await setupEdgeLogging(options);
    }
  } else if (typeof window !== 'undefined') {
    if (prodLogging) {
      options.browser = {
        write: () => void 0,
      };
    } else {
      const { setupBrowserLogging } = await import('./chalk-logger');
      await setupBrowserLogging(options);
      options.browser!.formatters!.log = (object) => {
        const attrs = getSpanContext();
        return {
          ...attrs,
          ...object,
        };
      }
    }
  }
  rootLogger = pino(options, stream).child(getGlobalContext());
  return rootLogger;
}

function getSimpleLogger() {
  if (typeof window !== 'undefined' || process.env.NEXT_RUNTIME !== 'nodejs') {
    return pino({
      browser: {
        write: () => void 0,
      },
    });
  }
  return pino();
}

export const LOGGER_CORRELATION_ID = 'request-id';
export const LOGGER_TRACE_ID = 'trace-id';
export const LOGGER_SPAN_ID = 'span-id';

type LoggerRequest = {
  headers: IncomingHttpHeaders | Headers;
}

export type LoggerOptions = {
  name?: string;
  bindings?: Bindings;
  parent?: Logger;
  request?: LoggerRequest
  noSpan?: boolean;
}

export function getLogger(opts?: LoggerOptions): Logger;
export function getLogger(name?: string, bindings?: Bindings, parent?: Logger): Logger;

export function getLogger(optsOrName?: LoggerOptions | string, bindings?: Bindings, parent?: Logger): Logger {
  let opts: LoggerOptions;
  if (typeof optsOrName === 'object') {
    opts = optsOrName;
  } else if (typeof optsOrName === 'string') {
    opts = { name: optsOrName, bindings: bindings, parent: parent };
  } else {
    opts = {};
  }

  if (!opts.parent) {
    if (!rootLogger) {
      parent = getSimpleLogger();
    } else {
      parent = rootLogger;
    }
  } else {
    parent = opts.parent;
  }

  const extraBindings: Bindings = {};
  if (opts.request) {
    const { request } = opts;
    const headers = request.headers;
    if (headers) {
      const correlationIdHeader = REQUEST_CORRELATION_ID_HEADER.toLowerCase();
      let correlationId: string | undefined;
      if (typeof headers.get === 'function') {
        const val = headers.get(correlationIdHeader);
        if (val) {
          correlationId = val;
        }
      } else {
        const val = headers[correlationIdHeader] as string | string[] | undefined;
        if (typeof val === 'string') {
          correlationId = val;
        } else if (Array.isArray(val)) {
          correlationId = val[0];
        }
      }
      if (correlationId) {
        extraBindings[LOGGER_CORRELATION_ID] = correlationId;
      }
    }
  }

  if (opts.name || opts.bindings || Object.keys(extraBindings).length > 0) {
    const allBindings = {
      ...(opts.bindings ?? {}),
      ...extraBindings,
    };
    if (opts.name) {
      allBindings.logger = opts.name;
    }
    const logger = parent.child(allBindings);
    if (opts.noSpan) {
      logger['noSpan'] = true;
    }
    return logger;
  }

  return parent;
};

export const getLoggerAsync = async (opts?: LoggerOptions) => {
  const parent = opts?.parent;
  if (!parent) {
    await initRootLogger();
  }
  return getLogger(opts);
};

const ID_ALPHABET = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
const nanoid = customAlphabet(ID_ALPHABET, 8);

export function generateCorrelationID() {
  return nanoid();
}
