import type { LoggerOptions, DestinationStream } from 'pino';
import pinoPretty from 'pino-pretty';
import { formatMessage, setupStyleMapping } from './chalk-logger';
import stringify from 'fast-safe-stringify';
import chalk from 'chalk';
import type { LogRecord } from './logger';

// eslint-disable-next-line @typescript-eslint/require-await
export async function setupNodeLogging(_options: LoggerOptions): Promise<DestinationStream> {
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
    /*
    message: (log, messageKey) => {
        const message = log[messageKey];
      console.log(log);
      return message as string;
    }
      */
  });
}
