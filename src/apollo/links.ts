import { ApolloLink, type NextLink, type Operation } from '@apollo/client';
import { loadDevMessages, loadErrorMessages } from '@apollo/client/dev';
import { type ErrorResponse, onError } from '@apollo/client/link/error';
import * as otelApi from '@opentelemetry/api';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import type { StartSpanOptions } from '@sentry/types';
import { Kind, type OperationDefinitionNode } from 'graphql';
import type { Bindings } from 'pino';

import { isLocal, isProductionDeployment, isServer } from '@common/env';
import { generateCorrelationID, getLogger } from '@common/logging';
import { logApolloError } from '@common/logging/apollo';

import type { DefaultApolloContext } from '.';

if (globalThis.__DEV__) {
  // Adds messages only in a dev environment
  loadDevMessages();
  loadErrorMessages();
}

const logErrorLink = onError((errorResponse: ErrorResponse) => {
  logApolloError(errorResponse);
});

const logOperation = new ApolloLink((operation, forward: NextLink) => {
  const { setContext, operationName, getContext } = operation;
  const queryId = generateCorrelationID();
  const ctx = getContext() as DefaultApolloContext;
  const opLogger = (ctx.logger ?? getLogger('graphql')).child(
    { 'graphql-operation': operationName, 'graphql-query-id': queryId },
    { level: !isServer && isProductionDeployment() ? 'fatal' : 'info' }
  );
  setContext({ ...ctx, start: Date.now(), logger: opLogger });
  opLogger.info(`Starting GraphQL request ${operationName}`);
  return forward(operation).map((data) => {
    const context = operation.getContext() as DefaultApolloContext;
    const now = Date.now();
    const start = context.start;
    const durationMs = start ? Math.round(now - start) : null;
    const logContext: Bindings = {
      duration: durationMs,
    };
    const durationStr = durationMs != null ? `(took ${durationMs} ms)` : `<unknown duration>`;
    if (isLocal) {
      logContext.responseLength = JSON.stringify(data).length;
    }
    const nrErrors = data.errors?.length;
    if (nrErrors) {
      opLogger.error(
        { errorCount: nrErrors, ...logContext },
        `Operation finished with errors ${durationStr}`
      );
    } else {
      opLogger.info(
        logContext,
        `GraphQL request ${operationName} finished successfully ${durationStr}`
      );
    }
    return data;
  });
});

export const logOperationLink = ApolloLink.from([logOperation, logErrorLink]);

export function extractDefinition(operation: Operation): OperationDefinitionNode {
  // We know we always have a single definition, because Apollo validates this before we get here.
  // With more then one query defined, an error like this is thrown and the query is never sent:
  // "react-apollo only supports a query, subscription, or a mutation per HOC. [object Object] had 2 queries, 0 subscriptions and 0 mutations. You can use 'compose' to join multiple operation types to a component"
  return operation.query.definitions.find(
    (q) => q.kind === Kind.OPERATION_DEFINITION
  ) as OperationDefinitionNode;
}

export const createSentryLink = (uri: string) => {
  const link = new ApolloLink((operation, forward) => {
    const definition = extractDefinition(operation);
    const opType = definition.operation;
    const spanOpts: StartSpanOptions = {
      op: `http.graphql.${opType}`,
      name: operation.operationName,
      onlyIfParent: true,
      //forceTransaction: true,
      attributes: {
        [ATTR_URL_FULL]: uri,
      },
    };
    return Sentry.startSpanManual(spanOpts, (span, finish) => {
      // Set propagation context for the outgoing request
      operation.setContext((previousContext: DefaultApolloContext) => {
        const headers: DefaultApolloContext['headers'] = {
          ...previousContext.headers,
        };
        //console.log('headers before', JSON.stringify(headers));
        if (typeof window !== 'undefined') {
          const baggage = Sentry.spanToBaggageHeader(span);
          const trace = Sentry.spanToTraceHeader(span);
          if (baggage) {
            headers['baggage'] = baggage;
          }
          if (trace) {
            headers['trace'] = trace;
          }
        } else {
          otelApi.propagation.inject(otelApi.context.active(), headers);
        }
        if (typeof window !== 'undefined') {
          console.log('headers after', JSON.stringify(headers));
        }
        return {
          headers,
        };
      });
      return forward(operation).map((result) => {
        if (result.errors) {
          //span.setAttribute('http.status_code', 500);
          span.setStatus({
            code: SPAN_STATUS_ERROR,
            message: result.errors[0].message,
          });
        } else {
          span.setStatus({ code: SPAN_STATUS_OK });
        }
        finish();
        return result;
      });
    });
  });
  return link;
};
