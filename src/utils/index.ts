import { FORWARDED_FOR_HEADER, FORWARDED_HOST_HEADER, FORWARDED_PROTO_HEADER } from "@common/constants/headers.mjs";
import type { IncomingMessage } from "http";

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

export function getClientIP(req: Request | IncomingMessage) {
  const fwdForHdr = getHeader(req, FORWARDED_FOR_HEADER);
  return fwdForHdr ? fwdForHdr.split(',')[0] : null;
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
}

export function getCurrentURL(req: Request | IncomingMessage) {
  const fwdHost = getHeader(req, FORWARDED_HOST_HEADER);
  const fwdProto = getHeader(req, FORWARDED_PROTO_HEADER) || 'http';
  return {
    baseURL: `${fwdProto}://${fwdHost}`,
    path: req.url || '/',
  };
}
