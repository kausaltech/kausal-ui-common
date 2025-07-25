import type { ApolloLink, Operation } from '@apollo/client';
import type { ApolloError } from '@apollo/client/errors/errors.cjs';
import type { ErrorResponse } from '@apollo/client/link/error';
import { HttpLink } from '@apollo/client/link/http/http.cjs';
import type { Bindings, Logger } from 'pino';

import type { ApolloClientType, DefaultApolloContext } from '@common/apollo/index.js';
import { isLocalDev } from '@common/env/static';

import { getLogger } from './logger';

const LOG_MAX_ERRORS = 3;

export type ApolloErrorContext = Partial<{
  operation: Operation;
  uri: string;
  client: ApolloClientType;
  component: string;
  logger: Logger;
}>;

function findUriFromClient(client: ApolloClientType) {
  let uri: string | null = null;
  let nrLinks = 0;
  let link: ApolloLink | undefined = client.link;
  while (link && nrLinks < 10) {
    if (link instanceof HttpLink) {
      if (typeof link.options.uri === 'string') {
        uri = link.options.uri;
      }
    }
    link = link.right;
    nrLinks++;
  }
  return uri;
}

export type ApolloErrorLike = ApolloError | ErrorResponse;

export function logApolloError(error: ApolloErrorLike, options?: ApolloErrorContext) {
  const operation = 'operation' in error ? error.operation : options?.operation;
  const operationCtx = operation?.getContext() as DefaultApolloContext | undefined;
  const opVars = operation?.variables;
  const variables = opVars && Object.keys(opVars).length ? JSON.stringify(opVars, null, 0) : null;

  const logCtx: Bindings = {};
  if (variables) logCtx['graphql.variables'] = variables;
  if (options?.component) logCtx.component = options.component;
  const uri = options?.uri ?? (options?.client && findUriFromClient(options.client)) ?? null;
  if (uri) logCtx['graphql.uri'] = uri;
  const logger = getLogger('graphql-error', logCtx, options?.logger ?? operationCtx?.logger);

  const { graphQLErrors, networkError } = error;
  const clientErrors = 'clientErrors' in error ? error.clientErrors : undefined;

  if (networkError) {
    const extraContext: Bindings = {};
    if ('statusCode' in networkError) {
      extraContext['http.response.status_code'] = networkError.statusCode;
      extraContext['http.response.status_text'] = networkError.response.statusText;
    }
    // If the error is a network error, log it as such; nothing else needs to be logged
    if (isLocalDev) {
      logger.error(extraContext, `❌ Network error: ${networkError.message}`);
    } else {
      logger.error(extraContext, `Network error: ${networkError.message}`);
    }
    return;
  }

  if (clientErrors?.length) {
    clientErrors.forEach((err, idx) => {
      if (idx >= LOG_MAX_ERRORS) return;
      logger.error(err, 'GraphQL client error');
    });
  }
  if (graphQLErrors?.length) {
    graphQLErrors.forEach((err, idx) => {
      if (idx >= LOG_MAX_ERRORS) return;
      logger.error(err, 'GraphQL error');
    });
  }
}
