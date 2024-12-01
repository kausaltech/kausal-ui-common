import type { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import type { Logger } from 'pino';

export type ApolloClientType = ApolloClient<NormalizedCacheObject>;

export interface DefaultApolloContext {
  locale?: string;
  logger: Logger;
  start?: number;
  wildcardDomains?: string[];
  headers?: Record<string, string>;
  componentName?: string;
}
