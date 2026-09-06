/* istanbul ignore file */
import type { LoggerOptions as PinoLoggerOptions } from 'pino';
import { pino } from 'pino';

import type * as ChalkLogger from './chalk-logger';
import { getGlobalContext, getRootLoggerOptions } from './init';
import { type LogRecord, getRootLogger, isPrettyLogger, setRootLogger } from './logger';

export function setupEdgeLoggingJson(options: PinoLoggerOptions) {
  // Pino types `write` as accepting a bare `object`, so we take one and narrow
  // to the record shape our own formatters put on the wire.
  const write = (record: object) => {
    const { time, level, ...rest } = record as LogRecord;
    const rec = {
      level,
      time: new Date(time).toISOString(),
      ...rest,
    };
    const logFunc = (message: string) => {
      if (level === 'fatal') {
        console.error(message);
      } else {
        console[level](message);
      }
    };
    try {
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
