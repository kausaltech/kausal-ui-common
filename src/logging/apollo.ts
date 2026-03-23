/* istanbul ignore file */
import type { ApolloLink } from '@apollo/client';
import {
  CombinedGraphQLErrors,
  CombinedProtocolErrors,
  LinkError,
  ServerError,
  ServerParseError,
  isErrorLike,
} from '@apollo/client/errors';
import type { Bindings, Logger } from 'pino';

import type { ApolloClientType, DefaultApolloContext } from '@common/apollo/index.js';
import { isLocalDev } from '@common/env/static';

import { getLogger } from './logger';

const LOG_MAX_ERRORS = 3;

export type ApolloErrorContext = Partial<{
  operation: ApolloLink.Operation;
  uri: string;
  client: ApolloClientType;
  component: string;
  logger: Logger;
}>;

export function logApolloError(error: unknown, options?: ApolloErrorContext) {
  let logger: Logger;
  if (!isErrorLike(error)) {
    logger = getLogger('graphql-error', {}, options?.logger);
    logger.error(error, 'Unknown GraphQL error');
  }
  const operation = options?.operation;
  const operationCtx = operation?.getContext() as DefaultApolloContext | undefined;
  const opVars = operation?.variables;
  const variables = opVars && Object.keys(opVars).length ? JSON.stringify(opVars, null, 0) : null;

  const logCtx: Bindings = {};
  if (variables) logCtx['graphql.variables'] = variables;
  if (options?.component) logCtx.component = options.component;
  const uri = options?.uri;
  if (uri) logCtx['graphql.uri'] = uri;
  logger = getLogger('graphql-error', logCtx, options?.logger ?? operationCtx?.logger);

  if (CombinedGraphQLErrors.is(error) || CombinedProtocolErrors.is(error)) {
    error.errors.forEach((err, idx) => {
      if (idx >= LOG_MAX_ERRORS) return;
      logger.error(err, 'GraphQL error');
    });
  } else if (ServerError.is(error) || ServerParseError.is(error)) {
    const extraContext: Bindings = {};
    if ('statusCode' in error) {
      extraContext['http.response.status_code'] = error.statusCode;
      extraContext['http.response.status_text'] = error.response.statusText;
    }
    // If the error is a network error, log it as such; nothing else needs to be logged
    if (isLocalDev) {
      logger.error(extraContext, `❌ Network error: ${error.message}`);
    } else {
      logger.error(extraContext, `Network error: ${error.message}`);
    }
    logger.error(error, 'GraphQL server error');
  } else if (LinkError.is(error)) {
    logger.error(error, 'GraphQL link error');
  } else {
    logger.error(error, 'Unknown GraphQL error');
  }
}
