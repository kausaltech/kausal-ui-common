import { pino } from 'pino';

import type * as ChalkLogger from './chalk-logger';
import { getGlobalContext, getRootLoggerOptions, getSpanContext } from './init';
import { getRootLogger, isPrettyLogger, setRootLogger } from './logger';

export function initBrowserRootLogger() {
  if (getRootLogger()) {
    return;
  }
  const options = getRootLoggerOptions();
  const prodLogging = !isPrettyLogger();
  if (prodLogging) {
    options.browser = {
      write: () => void 0,
    };
  } else {
    const { setupBrowserLogging } = require('./chalk-logger') as typeof ChalkLogger;
    setupBrowserLogging(options);
    options.browser!.formatters!.log = (object) => {
      const attrs = getSpanContext();
      return {
        ...attrs,
        ...object,
      };
    };
  }
  const logger = pino(options).child(getGlobalContext());
  setRootLogger(logger);
  return logger;
}
