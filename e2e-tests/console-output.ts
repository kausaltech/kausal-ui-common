import type { ConsoleMessage } from '@playwright/test';

const IGNORE_STARTSWITH = [
  '[HMR]',
  'Public environment',
  '[Client Instrumentation Hook]',
  'Maximum update depth exceeded',
];
const IGNORE_INCLUDES = [
  'Download the React DevTools',
  '[Fast Refresh]',
  'Failed to initialize WebGL',
  'Download the Apollo DevTools',
];

export function shouldIgnoreConsoleMessage(msg: ConsoleMessage) {
  const text = msg.text();
  if (
    IGNORE_STARTSWITH.some((startsWith) => text.startsWith(startsWith)) ||
    IGNORE_INCLUDES.some((includes) => text.includes(includes))
  )
    return true;
  return false;
}
