/* istanbul ignore file */
import type { IncomingMessage } from 'http';

import {
  FORWARDED_FOR_HEADER,
  FORWARDED_HOST_HEADER,
  FORWARDED_PROTO_HEADER,
} from '@common/constants/headers.mjs';

export function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

export function stripLeadingSlash(path: string) {
  return path.startsWith('/') ? path.slice(1) : path;
}

function getHeader(req: Request | IncomingMessage, header: string) {
  if (req instanceof Request) {
    return req.headers.get(header);
  }
  if (!(header in req.headers)) return null;
  const hdr = req.headers[header];
  return Array.isArray(hdr) ? hdr[0] : hdr;
}

/**
 * Normalize candidate IP strings: strip surrounding quotes/brackets and trailing ports.
 */
function normalizeIpCandidate(input: string): string {
  let v = input.trim();

  // remove surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }

  // portless uses a weird format: '::ffff:<ip>'
  if (v.startsWith('::ffff:')) {
    return v.slice(7);
  }

  // [ipv6]:port
  const bracketMatch = v.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  // ipv4:port
  const ipv4Port = v.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4Port) {
    return ipv4Port[1];
  }

  // ipv6 without brackets but with trailing :port — only strip if port looks like a real port (2-5 digits)
  const ipv6Port = v.match(/^([0-9a-fA-F:]+):(\d{2,5})$/);
  if (ipv6Port && ipv6Port[1].includes(':')) {
    return ipv6Port[1];
  }

  return v;
}

export function getClientIP(req: Request | IncomingMessage) {
  const fwdForHdr = getHeader(req, FORWARDED_FOR_HEADER);
  return fwdForHdr ? normalizeIpCandidate(fwdForHdr.split(',')[0]) : null;
}

export type CurrentURL = {
  /**
   * The base URL of the request (e.g. 'http://localhost:3000').
   */
  baseURL: string;
  /**
   * The path of the request (e.g. '/actions').
   */
  path: string;
};

export function getCurrentURL(req: Request | IncomingMessage) {
  const fwdHost = getHeader(req, FORWARDED_HOST_HEADER);
  const fwdProto = getHeader(req, FORWARDED_PROTO_HEADER) || 'http';
  return {
    baseURL: `${fwdProto}://${fwdHost}`,
    path: req.url || '/',
  };
}
