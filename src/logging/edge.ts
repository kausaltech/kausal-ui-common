/* istanbul ignore file */
import type { LoggerOptions as PinoLoggerOptions, WriteFn } from 'pino';
import { pino } from 'pino';

import type * as ChalkLogger from './chalk-logger';
import { getGlobalContext, getRootLoggerOptions } from './init';
import { type LogRecord, getRootLogger, isPrettyLogger, setRootLogger } from './logger';

export function setupEdgeLoggingJson(options: PinoLoggerOptions) {
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

export function initEdgeRootLogger() {
  if (getRootLogger()) {
    return;
  }
  const options = getRootLoggerOptions();
  const prodLogging = !isPrettyLogger();
  if (prodLogging) {
    setupEdgeLoggingJson(options);
  } else {
    const { setupEdgeLogging } = require('./chalk-logger') as typeof ChalkLogger;
    setupEdgeLogging(options);
  }
  const logger = pino(options).child(getGlobalContext());
  setRootLogger(logger);
  return logger;
}
