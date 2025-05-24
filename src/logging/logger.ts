import { REQUEST_CORRELATION_ID_HEADER } from '../constants/headers.mjs';
import { customAlphabet } from 'nanoid';
import type { IncomingHttpHeaders } from 'node:http';
import type { Bindings, Level, Logger } from 'pino';
import { pino } from 'pino';
import { envToBool } from '../env/utils';


export function getRootLogger() {
  return globalThis['__kausal_root_logger__'] as Logger | undefined;
}

export function setRootLogger(logger: Logger) {
  globalThis['__kausal_root_logger__'] = logger;
}

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

export function isPrettyLogger() {
  if (process.env.NODE_ENV === 'production') return false;
  if (envToBool(process.env.KUBERNETES_LOGGING, false)) return false;
  return true;
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
    const rootLogger = getRootLogger();
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

const ID_ALPHABET = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
const nanoid = customAlphabet(ID_ALPHABET, 8);

export function generateCorrelationID() {
  return nanoid();
}
