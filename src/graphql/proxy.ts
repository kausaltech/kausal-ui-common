import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { NextApiRequest } from 'next/types';

import type { FetchResult } from '@apollo/client';
import type { Body } from '@apollo/client/link/http/selectHttpOptionsAndBody';
import { propagation } from '@opentelemetry/api';
import { captureException, startSpan } from '@sentry/nextjs';

import {
  PATHS_INSTANCE_HOSTNAME_HEADER,
  PATHS_INSTANCE_IDENTIFIER_HEADER,
  WILDCARD_DOMAINS_HEADER,
} from '@common/constants/headers.mjs';
import { getPathsGraphQLUrl, getWatchGraphQLUrl, isLocalDev } from '@common/env';
import { getLogger } from '@common/logging/logger';
import {
  type APIType,
  getApiCookies,
  getClientCookiesFromBackendResponse,
} from '@common/utils/cookies';

const PASS_HEADERS = [
  PATHS_INSTANCE_IDENTIFIER_HEADER,
  PATHS_INSTANCE_HOSTNAME_HEADER,
  WILDCARD_DOMAINS_HEADER,
  'authorization',
  'accept-language',
  'dnt',
  'referer',
];

function headersFromApiRequest(req: NextApiRequest): Headers {
  const headerList = Object.fromEntries(
    Object.entries(req.headers).filter(([_, v]) => v !== undefined) as [string, string][]
  );
  return new Headers(headerList);
}

/**
 * Simple proxy which handles our GraphQL requests
 * to prevent CORS issues and attach auth headers.
 */
export default async function proxyGraphQLRequest(
  req: NextApiRequest | NextRequest,
  apiType: APIType
): Promise<NextResponse> {
  const incomingHeaders = req instanceof Request ? req.headers : headersFromApiRequest(req);
  const incomingRequest = (req instanceof Request ? await req.json() : req.body) as Body;
  const operationName = incomingRequest.operationName || '<unknown>';
  const logger = getLogger({
    name: 'graphql-proxy',
    request: req,
    bindings: {
      'graphql.operation.name': operationName,
    },
  });
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'HTTP method not allowed' }, { status: 405 });
  }
  if (incomingHeaders.get('content-type') !== 'application/json') {
    return NextResponse.json({ error: 'Invalid Content-Type header' }, { status: 415 });
  }

  // Determine headers to send to the backend.
  const backendHeaders = {};

  for (const h of PASS_HEADERS) {
    if (!incomingHeaders.has(h)) continue;
    const val = incomingHeaders.get(h);
    if (!val) continue;
    backendHeaders[h] = val;
  }

  // Trace propagation headers are passed through automatically.
  for (const field of propagation.fields()) {
    let val = incomingHeaders.get(field);
    if (Array.isArray(val)) {
      logger.warn(`Propagation field ${field} is array`, { field, val });
      continue;
    }
    if (!val) continue;
    // Remove leading and trailing commas
    val = val.replace(/^,+/, '').replace(/,+$/, '');
    if (!val) continue;
    backendHeaders[field] = val;
  }

  if (incomingHeaders.has('user-agent')) {
    backendHeaders['X-Original-User-Agent'] = incomingHeaders.get('user-agent')!;
  }

  const startedAt = new Date();
  logger.info(
    { 'user-agent': incomingHeaders.get('user-agent') },
    `Proxying GraphQL request ${operationName}`
  );

  backendHeaders['Content-Type'] = 'application/json';
  const backendCookies = getApiCookies(incomingHeaders, apiType);
  if (backendCookies.length) {
    backendHeaders['Cookie'] = backendCookies.join('; ');
  }
  const forwarded = incomingHeaders.get('x-forwarded-for');
  const remoteIp = forwarded ? forwarded.split(/, /)[0] : '';
  if (remoteIp) {
    backendHeaders['X-Forwarded-For'] = remoteIp;
  }

  if (isLocalDev && false) {
    logger.info(req.headers, 'Headers from client');
    logger.info(backendHeaders, 'Headers to backend');
  }

  const url = apiType === 'watch' ? getWatchGraphQLUrl() : getPathsGraphQLUrl();
  // Do the fetch from the backend
  const backendResponse = await startSpan({ op: 'graphql.request', name: operationName }, () => {
    return fetch(url, {
      method: 'POST',
      headers: backendHeaders,
      body: JSON.stringify(incomingRequest),
    });
  });

  const duration = new Date().getTime() - startedAt.getTime();
  logger.info(
    { 'http.response.duration': duration, 'http.response.status_code': backendResponse.status },
    `GraphQL request completed in ${duration} ms`
  );

  // Set response headers
  const responseHeaders: [string, string][] = [];
  const langHeader = backendResponse.headers.get('Content-Language');
  if (langHeader) responseHeaders.push(['Content-Language', langHeader]);

  // We don't want caching
  responseHeaders.push(['Cache-Control', 'no-store']);

  const setCookies = getClientCookiesFromBackendResponse(backendResponse, apiType);
  for (const cookie of setCookies) {
    responseHeaders.push(['Set-Cookie', cookie]);
  }

  if (!backendResponse.ok) {
    logger.error(`Backend responded with HTTP ${backendResponse.status}`);
    let data: object | undefined, errorMessage: string | undefined;
    try {
      if (backendResponse.headers.get('content-type') === 'application/json') {
        data = (await backendResponse.json()) as object;
      }
    } catch (error) {
      captureException(error);
    }
    if (!data) {
      errorMessage = await backendResponse.text();
      data = { errors: [{ message: errorMessage }] };
    }
    return NextResponse.json(data, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  }

  try {
    const data = (await backendResponse.json()) as FetchResult;
    return NextResponse.json(data, {
      headers: responseHeaders,
      status: backendResponse.status,
      statusText: backendResponse.statusText,
    });
  } catch (error) {
    // An error occurred parsing the error response as JSON
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        errors: [{ message: `Response is invalid JSON: ${message}` }],
      },
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: responseHeaders,
      }
    );
  }
}
