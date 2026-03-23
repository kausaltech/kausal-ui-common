import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { NextApiRequest, NextApiResponse } from 'next/types';

import type { BaseHttpLink } from '@apollo/client/link/http/BaseHttpLink';
import { propagation } from '@opentelemetry/api';
import { captureException, startSpan } from '@sentry/nextjs';

import {
  PATHS_INSTANCE_HOSTNAME_HEADER,
  PATHS_INSTANCE_IDENTIFIER_HEADER,
  WILDCARD_DOMAINS_HEADER,
} from '@common/constants/headers.mjs';
import { getPathsGraphQLUrl, getWatchGraphQLUrl } from '@common/env';
import { envToBool } from '@common/env/utils';
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

type Body = BaseHttpLink.Body;

function headersFromApiRequest(req: NextApiRequest): Headers {
  const headerList = Object.fromEntries(
    Object.entries(req.headers).filter(([_, v]) => v !== undefined) as [string, string][]
  );
  return new Headers(headerList);
}

type HttpResponse = {
  statusCode?: number;
  statusText?: string;
  headers?: [string, string][];
};

function respondWithStatus(data: Record<string, unknown>, response?: HttpResponse): NextResponse {
  const headers = response?.headers ?? undefined;
  return NextResponse.json(data, {
    status: response?.statusCode ?? 200,
    statusText: response?.statusText ?? undefined,
    headers,
  });
}

function respondWithStatusLegacy(
  res: NextApiResponse,
  data: Record<string, unknown>,
  response?: HttpResponse
): NextResponse {
  const { statusCode, headers, statusText } = response ?? {};
  console.log(headers);
  if (headers) {
    headers.forEach(([hdr, val]) => {
      res.appendHeader(hdr, val);
    });
  }
  if (statusText) {
    res.statusMessage = statusText;
  }
  res.status(statusCode ?? 200).json(data);
  return new NextResponse();
}

type Responder = (data: Record<string, unknown>, response?: HttpResponse) => NextResponse;

function getResponder(res: NextApiResponse | undefined): Responder {
  if (res) {
    return (data, response) => respondWithStatusLegacy(res, data, response);
  }
  return respondWithStatus;
}

export async function proxyGraphQLRequest(
  req: NextApiRequest,
  apiType: APIType,
  res: NextApiResponse
): Promise<NextResponse>;
export async function proxyGraphQLRequest(
  req: NextRequest,
  apiType: APIType
): Promise<NextResponse>;

/**
 * Simple proxy which handles our GraphQL requests
 * to prevent CORS issues and attach auth headers.
 */
export default async function proxyGraphQLRequest(
  req: NextApiRequest | NextRequest,
  apiType: APIType,
  res?: NextApiResponse
): Promise<NextResponse | void> {
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
  const respond = getResponder(res);
  if (req.method !== 'POST') {
    return respond({ error: 'HTTP method not allowed' }, { statusCode: 405 });
  }
  if (incomingHeaders.get('content-type') !== 'application/json') {
    return respond({ error: 'Invalid Content-Type header' }, { statusCode: 415 });
  }

  if (envToBool(process.env.OTEL_DEBUG, false)) {
    const debugHeaders = Array.from(
      incomingHeaders.entries().map(([key, value]) => `${key}: ${value}`)
    );
    debugHeaders.sort();
    logger.debug(`Incoming headers:\n${debugHeaders.join('\n')}`);
  }

  // Determine headers to send to the backend.
  const backendHeaders: Record<string, string> = {};

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
      logger.warn(`Propagation field ${field} is array: ${JSON.stringify(val)}`);
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

  if (envToBool(process.env.OTEL_DEBUG, false)) {
    const debugHeaders = Array.from(
      Object.entries(backendHeaders).map(([key, value]) => `${key}: ${value}`)
    );
    debugHeaders.sort();
    logger.debug(`Headers to backend:\n${debugHeaders.join('\n')}`);
  }

  const url = apiType === 'watch' ? getWatchGraphQLUrl() : getPathsGraphQLUrl();
  // Do the fetch from the backend
  let backendResponse: Response;
  try {
    backendResponse = await startSpan({ op: 'graphql.request', name: operationName }, () => {
      return fetch(url, {
        method: 'POST',
        headers: backendHeaders,
        body: JSON.stringify(incomingRequest),
      });
    });
  } catch (error) {
    captureException(error);
    logger.error(error, 'Failed to proxy GraphQL request');
    return respond({ errors: [{ message: 'Backend request failed' }] }, { statusCode: 500 });
  }
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
    let data: Record<string, unknown> | undefined, errorMessage: string | undefined;
    try {
      if (backendResponse.headers.get('content-type') === 'application/json') {
        data = (await backendResponse.json()) as Record<string, unknown>;
      }
    } catch (error) {
      captureException(error);
    }
    if (!data) {
      errorMessage = await backendResponse.text();
      data = { errors: [{ message: errorMessage }] };
    }
    return respond(data, {
      statusCode: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  }

  try {
    const data = (await backendResponse.json()) as Record<string, unknown>;
    return respond(data, {
      statusCode: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // An error occurred parsing the error response as JSON
    const message = error instanceof Error ? error.message : 'Unknown error';
    return respond(
      {
        errors: [{ message: `Response is invalid JSON: ${message}` }],
      },
      {
        statusCode: 500,
        statusText: 'Internal Server Error',
        headers: responseHeaders,
      }
    );
  }
}
