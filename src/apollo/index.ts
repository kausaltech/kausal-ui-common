import type { ApolloClient } from '@apollo/client';
import type { Span } from '@sentry/core';
import type { Logger } from 'pino';

export type ApolloClientType = ApolloClient;

export interface DefaultApolloContext {
  locale?: string;
  logger: Logger;
  start?: number;
  wildcardDomains?: string[];
  headers?: Record<string, string>;
  componentName?: string;
  span?: Span;
  traceId?: string;
  spanId?: string;
  uri?: string;
}
