import type { DestinationStream } from 'pino';
import { pino } from 'pino';
import { getGlobalContext, getRootLoggerOptions } from './init';
import { getRootLogger, isPrettyLogger, setRootLogger } from './logger';
import type * as PrettyNodeLogger from './pretty-node-logger';

export function initNodeRootLogger() {
  if (getRootLogger()) {
    return;
  }
  const options = getRootLoggerOptions();
  const prodLogging = !isPrettyLogger();
  let stream: DestinationStream | undefined;
  if (prodLogging) {
    // Default options are fine.
    options.timestamp = () => `,"time":"${new Date(Date.now()).toISOString()}"`;
  } else {
    const { setupNodeLogging } =
      require('./pretty-node-logger') as typeof PrettyNodeLogger;
    stream = setupNodeLogging(options);
  }
  const logger = pino(options, stream).child(getGlobalContext());
  setRootLogger(logger);
  return logger;
}
