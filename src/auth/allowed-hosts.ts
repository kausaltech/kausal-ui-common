import { getDeploymentType, getWildcardDomains, isLocalDev } from '@common/env';

type AllowedHostsInput = {
  wildcardDomains: string[];
  /** Comma-separated list of extra hostnames, as in the `AUTH_ALLOWED_HOSTS` env var. */
  extraHosts?: string | undefined;
  /** Also match any port, needed where the app is served on e.g. `localhost:3000`. */
  allowAnyPort: boolean;
};

/**
 * Build the host patterns better-auth accepts when resolving its base URL
 * from the incoming request.
 *
 * Wildcard domains (e.g. "watch.kausal.tech") become `*.watch.kausal.tech`.
 * Customer-controlled domains that don't follow the wildcard pattern are
 * passed in `extraHosts` as-is.
 */
export function buildAllowedHosts({
  wildcardDomains,
  extraHosts,
  allowAnyPort,
}: AllowedHostsInput): string[] {
  const hosts: string[] = [];

  for (const domain of wildcardDomains) {
    hosts.push(`*.${domain}`);
    if (allowAnyPort) {
      hosts.push(`*.${domain}:*`);
    }
  }

  for (const host of (extraHosts ?? '').split(',')) {
    const trimmed = host.trim();
    if (trimmed) hosts.push(trimmed);
  }

  if (hosts.length === 0) {
    // The env vars are not available during `next build`, and better-auth
    // refuses an empty list.
    hosts.push('localhost');
  }

  return hosts;
}

export function getAllowedHosts(): string[] {
  return buildAllowedHosts({
    wildcardDomains: getWildcardDomains(),
    extraHosts: process.env.AUTH_ALLOWED_HOSTS,
    // CI runs a production build on `{id}.localhost:3000`
    allowAnyPort: isLocalDev || getDeploymentType() === 'ci',
  });
}
