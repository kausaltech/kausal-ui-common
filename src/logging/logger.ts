import { customAlphabet } from 'nanoid';
import type { Bindings, DestinationStream, Level, Logger, LoggerOptions, WriteFn } from 'pino';
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
  [key: string]: unknown;
};

function setupEdgeLoggingJson(options: LoggerOptions) {
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

function getGlobalContext() {
  return {
    runtime: typeof window !== 'undefined' ? 'browser' : process.env.NEXT_RUNTIME,
  };
}

export async function initRootLogger() {
  if (rootLogger) {
    return rootLogger;
  }
  const isProd = (process.env.NODE_ENV || 'development') == 'production';
  const logLevel = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');
  const options: LoggerOptions = {
    level: logLevel,
    formatters: {},
  };
  options.formatters!.level = (label, _number) => ({ level: label });

  const prodLogging = process.env.NODE_ENV === 'production';
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

export const getLogger = (name?: string, bindings?: Bindings, parent?: Logger) => {
  if (!parent) {
    if (!rootLogger) {
      parent = getSimpleLogger();
    } else {
      parent = rootLogger;
    }
  }
  if (name || bindings) {
    return parent.child({ ...(bindings ?? {}), logger: name });
  }
  return parent;
};

const ID_ALPHABET = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
const nanoid = customAlphabet(ID_ALPHABET, 8);

export function generateCorrelationID() {
  return nanoid();
}
