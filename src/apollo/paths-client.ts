/**
 * Apollo client configuration for the Kausal Paths GraphQL API.
 *
 * Used by paths-ui for its only client, and by watch-ui for a second client
 * that fetches impact-model data next to the Watch client. Everything that
 * differs between the apps (generated possible types, the browser proxy
 * path, authentication) is passed in through `PathsApolloClientOpts`.
 */
import {
  ApolloClient,
  ApolloLink,
  type DefaultContext,
  HttpLink,
  InMemoryCache,
  type InMemoryCacheConfig,
  type PossibleTypesMap,
} from '@apollo/client';
import { type DirectiveNode, Kind, type VariableDefinitionNode } from 'graphql';
import type { Logger } from 'pino';
import { tap } from 'rxjs';

import {
  FORWARDED_HEADER,
  PATHS_INSTANCE_HOSTNAME_HEADER,
  PATHS_INSTANCE_IDENTIFIER_HEADER,
  WILDCARD_DOMAINS_HEADER,
} from '@common/constants/headers.mjs';
import { GRAPHQL_CLIENT_PROXY_PATH } from '@common/constants/routes.mjs';
import { getPathsGraphQLUrl, getRuntimeConfig } from '@common/env';
import type { CurrentURL } from '@common/utils';

import { type DirectiveArg, createOperationDirective } from './directives';
import { createSentryLink, logOperationLink, retryLink } from './links';

export type PreviewMode = 'DRAFT' | 'PUBLISHED';

export type PathsApolloClientOpts = {
  instanceHostname?: string;
  instanceIdentifier?: string;
  wildcardDomains?: string[];
  authorizationToken?: string | undefined;
  clientIp?: string | null;
  locale?: string;
  currentURL?: CurrentURL;
  /** Cookie header forwarded to the backend during server-side rendering. */
  clientCookies?: string;
  logger?: Logger;
  /** Generated `possible_types.json` of the Paths schema in the consuming app. */
  possibleTypes: PossibleTypesMap;
  /**
   * Path of the Next.js route that proxies browser requests to the Paths API.
   * Defaults to `/api/graphql`, which is the Paths proxy in paths-ui.
   */
  browserProxyPath?: string;
  /** Called when the backend rejects the request's OAuth access token. */
  onInvalidToken?: () => void;
  /**
   * Called per operation to decide whether to attach `preview` to the
   * `@instance` directive. Returning a mode forces the backend's Phase-4
   * resolver split onto that slice; returning null leaves the default
   * (published-first) behavior. Invoked lazily so client-side nav is
   * picked up without recreating the Apollo client.
   */
  previewMode?: () => PreviewMode | null;
};

type PathsOperationContext = DefaultContext & {
  locale?: string;
  /**
   * Opt the operation into the backend's fault-tolerant mode: node failures
   * are quarantined and reported via `editor.status`/`editor.errors` instead
   * of aborting the whole computation. Attaches `tolerateNodeFailures` to the
   * injected `@instance` directive.
   */
  tolerateNodeFailures?: boolean;
};

const isServerSide = () => typeof window === 'undefined';

const localeMiddleware = new ApolloLink((operation, forward) => {
  operation.setContext(({ headers = {}, locale }: PathsOperationContext) => {
    if (locale) {
      return {
        headers: {
          ...headers,
          'accept-language': locale,
        },
      };
    }
  });
  return forward(operation);
});

export function getPathsHttpHeaders(opts: Omit<PathsApolloClientOpts, 'possibleTypes'>) {
  const {
    instanceHostname,
    instanceIdentifier,
    wildcardDomains = getRuntimeConfig().wildcardDomains,
    authorizationToken,
    currentURL,
    clientIp,
    clientCookies,
  } = opts;
  const headers: Record<string, string> = {};

  if (instanceIdentifier) {
    headers[PATHS_INSTANCE_IDENTIFIER_HEADER] = instanceIdentifier;
  }
  if (instanceHostname) {
    headers[PATHS_INSTANCE_HOSTNAME_HEADER] = instanceHostname;
  }
  if (wildcardDomains) {
    headers[WILDCARD_DOMAINS_HEADER] = wildcardDomains.join(',');
  }
  if (authorizationToken) {
    headers['authorization'] = `Bearer ${authorizationToken}`;
  }
  if (currentURL) {
    const { baseURL, path } = currentURL;
    headers['referer'] = baseURL + path;
  }
  if (isServerSide()) {
    if (clientIp) {
      headers[FORWARDED_HEADER] = `for="${clientIp}"`;
    }
    if (clientCookies) {
      headers['cookie'] = clientCookies;
    }
  }
  return headers;
}

function directiveExists(directives: DirectiveNode[], name: string) {
  return directives.some((d) => d.name.value === name);
}

/**
 * Middleware that identifies the Paths instance and locale by injecting the
 * `@instance` and `@locale` operation directives.
 *
 * If identifier is set directly, use that, or fall back to request hostname.
 */
export const makePathsInstanceMiddleware = (opts: PathsApolloClientOpts) => {
  const { instanceHostname, instanceIdentifier, locale, previewMode } = opts;
  if (!instanceHostname && !instanceIdentifier) {
    throw new Error('Neither hostname or identifier set for the instance');
  }

  const middleware = new ApolloLink((operation, forward) => {
    const variables: Record<string, unknown> = {
      ...operation.variables,
    };
    // A per-operation `context.locale` (e.g. set by the model editor to force
    // default-language content) wins over the client-default locale.
    const opContext = operation.getContext() as PathsOperationContext;
    const effectiveLocale = opContext.locale ?? locale;
    const tolerateNodeFailures = opContext.tolerateNodeFailures === true;

    const definitions = operation.query.definitions.map((def) => {
      if (def.kind !== Kind.OPERATION_DEFINITION) return def;
      const variableDefinitions: VariableDefinitionNode[] = [...(def.variableDefinitions ?? [])];
      const directives: DirectiveNode[] = [...(def.directives ?? [])];

      if (directiveExists(directives, 'context')) {
        return def;
      }

      if (effectiveLocale && !directiveExists(directives, 'locale')) {
        const directive = createOperationDirective({
          name: 'locale',
          args: [
            {
              name: 'lang',
              variable: {
                name: '_locale',
                type: 'String',
              },
            },
          ],
        });
        directives.push(directive.directive);
        variableDefinitions.push(...directive.variableDefinitions);
        variables['_locale'] = effectiveLocale;
      }
      const instanceArgs: DirectiveArg[] = [];
      if (instanceIdentifier && !directiveExists(directives, 'identifier')) {
        instanceArgs.push({
          name: 'identifier',
          variable: {
            name: '_identifier',
            type: 'ID',
          },
        });
        variables['_identifier'] = instanceIdentifier;
      }
      if (instanceHostname && !directiveExists(directives, 'hostname')) {
        instanceArgs.push({
          name: 'hostname',
          variable: {
            name: '_hostname',
            type: 'String',
          },
        });
        variables['_hostname'] = instanceHostname;
      }
      const preview = previewMode?.();
      if (preview) {
        instanceArgs.push({
          name: 'preview',
          variable: {
            name: '_preview',
            type: 'PreviewMode',
          },
        });
        variables['_preview'] = preview;
      }
      if (tolerateNodeFailures) {
        instanceArgs.push({
          name: 'tolerateNodeFailures',
          variable: {
            name: '_tolerateNodeFailures',
            type: 'Boolean',
          },
        });
        variables['_tolerateNodeFailures'] = true;
      }
      if (instanceArgs.length && !directiveExists(directives, 'instance')) {
        const directive = createOperationDirective({
          name: 'instance',
          args: instanceArgs,
        });
        directives.push(directive.directive);
        variableDefinitions.push(...directive.variableDefinitions);
      }
      return {
        ...def,
        directives,
        variableDefinitions,
      };
    });

    operation.query = {
      ...operation.query,
      definitions,
    };
    operation.variables = variables;

    return forward(operation);
  });

  return middleware;
};

const makeHeadersMiddleware = (opts: PathsApolloClientOpts) =>
  new ApolloLink((operation, forward) => {
    operation.setContext(({ headers = {} }) => ({
      headers: {
        ...headers,
        ...getPathsHttpHeaders(opts),
      },
    }));
    return forward(operation);
  });

async function apolloFetch(url: RequestInfo | URL, init?: RequestInit) {
  // TODO: Sign the request headers here
  return await fetch(url, init);
}

const makeAuthErrorLink = (opts: PathsApolloClientOpts) =>
  new ApolloLink((operation, forward) =>
    forward(operation).pipe(
      tap((result) => {
        const isInvalidToken = result.errors?.some(
          (error) =>
            error.extensions?.code === 'invalid_token' || error.message.startsWith('invalid_token')
        );
        // The browser callback starts an async sign-out. The RSC callback throws
        // Next.js's redirect signal, which RxJS propagates as the operation error.
        if (isInvalidToken) opts.onInvalidToken?.();
      })
    )
  );

export function getPathsApolloClientConfig(opts: PathsApolloClientOpts): {
  link: ApolloLink;
  cache: InMemoryCacheConfig;
} {
  const uri = isServerSide()
    ? getPathsGraphQLUrl()
    : (opts.browserProxyPath ?? GRAPHQL_CLIENT_PROXY_PATH);

  const httpLink = new HttpLink({
    uri,
    credentials: 'include',
    fetchOptions: {
      referrerPolicy: 'unsafe-url',
    },
    fetch: apolloFetch,
  });

  return {
    link: ApolloLink.from([
      retryLink,
      makeAuthErrorLink(opts),
      createSentryLink(uri),
      logOperationLink,
      localeMiddleware,
      makeHeadersMiddleware(opts),
      makePathsInstanceMiddleware(opts),
      httpLink,
    ]),
    cache: {
      possibleTypes: opts.possibleTypes,
      typePolicies: {
        CardListCardBlock: {
          keyFields: false,
        },
        // ImpactOverviewType `id` is `<costNodeId>:<effectNodeId>` and is NOT
        // unique — several overviews can share the same (cost, effect) node
        // pair but differ by graphType (e.g. simple_effect + wedge_diagram on
        // net_emissions). Default normalization would collapse them all into
        // one cache entry. Disable normalization so each list entry stays
        // distinct.
        ImpactOverviewType: {
          keyFields: false,
        },
      },
    },
  };
}

/**
 * Create a plain Apollo client for the Paths API.
 *
 * For apps where Paths is a secondary API next to another client provided by
 * `ApolloNextAppProvider`: that provider keeps a single client per browser,
 * so the Paths client cannot be created through it. Callers are responsible
 * for keeping one instance per browser and creating a new one per server
 * request.
 */
export function makePathsClient(opts: PathsApolloClientOpts) {
  const { link, cache } = getPathsApolloClientConfig(opts);
  return new ApolloClient({
    link,
    cache: new InMemoryCache(cache),
    defaultContext: {
      locale: opts.locale,
      ...(opts.logger ? { logger: opts.logger } : {}),
    },
    devtools: { enabled: !isServerSide(), name: 'paths' },
  });
}
