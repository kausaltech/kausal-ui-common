import chalk from 'chalk';
import stringify from 'fast-safe-stringify';
import type { DestinationStream, LoggerOptions as PinoLoggerOptions } from 'pino';
import type * as PinoPretty from 'pino-pretty';

import { formatMessage, setupStyleMapping } from './chalk-logger';
import type { LogRecord } from './logger';

export function setupNodeLogging(_options: PinoLoggerOptions): DestinationStream {
  const pinoPretty = (require('pino-pretty') as typeof PinoPretty).default;
  setupStyleMapping(chalk);
  return pinoPretty({
    colorize: false,
    levelFirst: true,
    singleLine: true,
    ignore: 'pid,hostname',
    hideObject: true,
    customPrettifiers: {
      time: () => {
        return '';
      },
      hostname: () => {
        return '';
      },
      pid: () => {
        return '';
      },
      level: () => {
        return '';
      },
    },
    messageFormat: (log: LogRecord, _messageKey) => {
      const { level, time, runtime, logger, msg, pid, hostname, ...rest } = log;
      const record = {
        level,
        time: new Date(time),
        runtime,
        logger,
        message: msg,
        rest,
      };
      const { message, rest: restData } = formatMessage(record);
      let out = message + '\n';
      if (Object.keys(restData).length > 0) {
        out += '  ' + stringify(restData, undefined, 0) + '\n';
      }
      return out;
    },
  });
}
