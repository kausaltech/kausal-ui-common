/**
 * Only accept same-origin paths as post-login or post-recovery targets, to
 * avoid open redirects. Protocol-relative (`//evil.com`) and backslash
 * (`/\evil.com`, which browsers normalize to `//`) paths are rejected.
 */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return '/';
  }
  return path;
}
