export function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

export function stripLeadingSlash(path: string) {
  return path.startsWith('/') ? path.slice(1) : path;
}
