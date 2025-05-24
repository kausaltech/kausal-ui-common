import type { Level, LoggerOptions, WriteFn } from 'pino';
import type { LogRecord } from './logger';
import type chalkModule from 'chalk';
import stringify from 'fast-safe-stringify';
import dayjs from 'dayjs';

type CI = chalkModule.Chalk

type LogFunc = (...args: unknown[]) => void;

let loggerFuncMap: { unknown: LogFunc } & Record<Level, LogFunc>;
let levelStyleMap: { unknown: CI } & Record<Level, CI>;
export type MessageStyles = {
  logger: CI;
  time: CI;
  message: CI;
  edgeRuntime: CI;
  nodejsRuntime: CI;
  key: CI;
  stringValue: CI;
  booleanValue: CI;
  numberValue: CI;
  objectValue: CI;
}

let messageStyles: MessageStyles;

export function setupStyleMapping(chalk: typeof chalkModule) {
  loggerFuncMap = {
    fatal: console.error,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    trace: console.trace,
    unknown: console.log,
  };

  levelStyleMap = {
    fatal: chalk.bgRed.whiteBright,
    error: chalk.bgRed.whiteBright,
    warn: chalk.bgYellowBright.black,
    info: chalk.bgBlue.whiteBright,
    debug: chalk.bgGray.whiteBright,
    trace: chalk.bgGray.white,
    unknown: chalk.bgGray.white,
  };
  messageStyles = {
    logger: chalk.whiteBright.italic,
    time: chalk.cyan,
    message: chalk,
    edgeRuntime: chalk.bgCyan.whiteBright,
    nodejsRuntime: chalk.bgGreen.whiteBright,
    key: chalk.gray,
    stringValue: chalk.green,
    booleanValue: chalk.blue,
    numberValue: chalk.yellow,
    objectValue: chalk.gray,
  };
  return messageStyles;
}

type ChalkRecord = {
  runtime: 'edge' | 'nodejs' | 'browser',
  level: Level,
  logger?: string,
  time: Date,
  message?: string,
  rest: Record<string, unknown>,
}

export type FormattedLogRecord = {
  message: string,
  rest: Record<string, unknown>,
}

export function formatMessage(record: ChalkRecord) {
  const style = levelStyleMap[record.level] ?? levelStyleMap.unknown;
  const runtimeStyle = record.runtime === 'edge' ? messageStyles.edgeRuntime : messageStyles.nodejsRuntime;
  let fullMsg = '';
  fullMsg += `${messageStyles.time(dayjs(record.time).format('HH:mm.SSS'))} `;
  fullMsg += `${style(' ' + record.level.toUpperCase().padEnd(6))}`;
  fullMsg += `${runtimeStyle(' ' + record.runtime.padEnd(7))} `;
  fullMsg += `${messageStyles.logger((record.logger ? ` ${record.logger}` : ' log') + ' ')}`;
  if (record.message !== undefined) {
    fullMsg += ` ${messageStyles.message(record.message)}`;
  }
  let simpleKeyString = '';
  const rest = {};
  Object.entries(record.rest).forEach(([key, value]) => {
    let color: CI | undefined, strVal: string | undefined;
    switch (typeof value) {
      case 'string':
        color = messageStyles.stringValue;
        if (/\s/.test(value)) {
          strVal = `"${value}"`;
        } else {
          strVal = value;
        }
        break;
      case 'boolean':
        color = messageStyles.booleanValue;
        strVal = value.toString();
        break;
      case 'number':
        color = messageStyles.numberValue;
        strVal = value.toString();
        break;
      default:
        rest[key] = value;
    }
    if (color) {
      simpleKeyString += ` ${messageStyles.key(key)}=${color(strVal)}`;
    }
  });
  return {
    message: fullMsg + simpleKeyString,
    rest,
  };
}

export function writeLog(record: ChalkRecord) {
  const logFunc = loggerFuncMap[record.level] ?? console.log;
  const { message, rest } = formatMessage(record);
  const args: unknown[] = [message];
  if (Object.keys(rest).length > 0) {
    if (typeof window === 'undefined') {
      args.push('\n  ' + stringify(rest, undefined, 0));
    } else {
      args.push(rest);
    }
  }
  logFunc(...args);
}

const write: WriteFn = (obj: LogRecord) => {
  const { runtime, time, level, msg, logger, ...rest } = obj;
  try {
    const record: ChalkRecord = {
      runtime,
      level,
      logger,
      time: new Date(time),
      message: msg,
      rest,
    };
    writeLog(record);
  } catch (err) {
    console.error(err);
  }
};


export function setupBrowserLogging(options: LoggerOptions) {
  const chalk = require('chalk') as typeof chalkModule;
  setupStyleMapping(chalk);
  options.browser = {
    formatters: {
      level: options.formatters!.level,
    },
    write,
  };
}

export function setupEdgeLogging(options: LoggerOptions) {
  // We need to pretend to be a browser to get colors
  globalThis.navigator = {
    // @ts-expect-error userAgentData is not in the type
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: 120 },
      ]
    }
  }
  const chalk = require('chalk') as typeof chalkModule;
  setupStyleMapping(chalk);
  options.browser = {
    formatters: {
      level: options.formatters!.level,
    },
    write,
  };
}
