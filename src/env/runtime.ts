import { env as getPublicEnv } from 'next-runtime-env/build/script/env';
import { getLogger } from '../logging';
import { coerceToBool } from './utils';
import { getProjectId } from './static';

const isServer = typeof window === 'undefined';
const isLocal = process.env.NODE_ENV === 'development';

export type DeploymentType =
  'production'
  | 'staging'
  | 'development'
  | 'testing'
  | 'ci'
  | 'wip';

const KNOWN_DEPLOYMENT_TYPES = [
  'production',
  'staging',
  'development',
  'testing',
  'ci',
  'wip',
];

type RuntimeConfig = {
  isServer: boolean;
  deploymentType: DeploymentType;
  isLocal: boolean;
  buildId: string;
  apiUrl: string;
  gqlUrl: string;
  wildcardDomains: string[];
  authIssuer?: string;
  logGraphqlQueries: boolean;
  sentryDsn: string | undefined;
  sentryTraceSampleRate: number;
  sentryReplaysSampleRate: number;
};

function ensureKnownDeploymentType(val: string): DeploymentType {
  if (!KNOWN_DEPLOYMENT_TYPES.includes(val)) return 'development';
  return val as DeploymentType;
}

function env(key: string) {
  if (isServer) {
    return process.env[key];
  }
  if (!/^NEXT_PUBLIC_/i.test(key)) {
    key = `NEXT_PUBLIC_${key}`;
  }
  return getPublicEnv(key);
}

export function getDeploymentType(): DeploymentType {
  const val =
    env('DEPLOYMENT_TYPE') ||
    env('NEXT_PUBLIC_DEPLOYMENT_TYPE') ||
    'development';
  return ensureKnownDeploymentType(val);
}

export function isProductionDeployment() {
  return getDeploymentType() === 'production';
}

export function getWatchBackendUrl() {
  return env('WATCH_BACKEND_URL') || 'https://api.watch.kausal.tech';
}

export function getPathsBackendUrl() {
  return env('PATHS_BACKEND_URL') || 'https://api.paths.kausal.dev';
}

export function getDefaultBackendUrl() {
  return getProjectId() === 'watch-ui' ? getWatchBackendUrl() : getPathsBackendUrl();
}

export function getWatchApiUrl() {
  return `${getWatchBackendUrl()}/v1`;
}

export function getWatchGraphQLUrl() {
  return `${getWatchBackendUrl()}/v1/graphql/`;
}

export function getPathsGraphQLUrl() {
  return `${getPathsBackendUrl()}/v1/graphql/`;
}

export function getWildcardDomains(): string[] {
  const domains =
    env('WILDCARD_DOMAINS') ?? env('NEXT_PUBLIC_WILDCARD_DOMAINS');

  // In dev mode, default to `localhost` being a wildcard domain.
  if (!domains) return isLocal ? ['localhost'] : [];

  return domains.split(',').map((s) => s.toLowerCase());
}

export function getAuthIssuer() {
  return (
    env('NEXT_PUBLIC_AUTH_ISSUER') || env('AUTH_ISSUER') || getDefaultBackendUrl()
  );
}

export function getSentryDsn(): string | undefined {
  return env('SENTRY_DSN') || env('NEXT_PUBLIC_SENTRY_DSN');
}

export function getBuildId(): string {
  const envVal = env('BUILD_ID');
  if (envVal) return envVal;
  return 'dev';
}

export function getAssetPrefix(): string {
  const envVal = env('ASSET_PREFIX') || '';
  if (envVal.endsWith('/')) {
    throw new Error("ASSET_PREFIX must not end with '/'");
  }
  return envVal;
}

function getSentryRate(envVar: string, defaultRate?: number) {
  const defaultVal = defaultRate ?? (isLocal ? 1.0 : 0.1);
  const envVal = env(envVar);
  if (envVal === undefined) return defaultVal;
  const val = Number.parseFloat(envVal);
  if (!(val >= 0 && val <= 1)) return defaultVal;
  return val;
}

export function getSentryTraceSampleRate(): number {
  return getSentryRate('SENTRY_TRACE_SAMPLE_RATE');
}

export function getSentryReplaysSampleRate(): number {
  const debugEnabled = process.env.SENTRY_DEBUG === '1';
  const defaultRate = debugEnabled ? 1.0 : 0.0;
  return getSentryRate('SENTRY_REPLAYS_SAMPLE_RATE', defaultRate);
}

export const authIssuer = env('NEXT_PUBLIC_AUTH_ISSUER');

export const logGraphqlQueries =
  isServer && process.env.LOG_GRAPHQL_QUERIES === 'true';

/**
 * Returns the URL to use for Spotlight, or null if Spotlight is not enabled.
 */
export function getSpotlightUrl() {
  if (!isLocal) return null;
  const envValue = process.env.SENTRY_SPOTLIGHT;
  if (!envValue) return null;
  const boolValue = coerceToBool(envValue);
  if (boolValue) {
    return 'http://localhost:8969/stream';
  } else if (boolValue === false) {
    return null;
  }
  return envValue;
}


export function getRuntimeConfig() {
  const projectId = getProjectId();
  const config: RuntimeConfig = {
    isServer,
    isLocal,
    buildId: getBuildId(),
    deploymentType: getDeploymentType(),
    apiUrl: projectId === 'watch-ui' ? getWatchBackendUrl() : getPathsBackendUrl(),
    gqlUrl: projectId === 'watch-ui' ? getWatchGraphQLUrl() : getPathsGraphQLUrl(),
    wildcardDomains: getWildcardDomains(),
    authIssuer: getAuthIssuer(),
    logGraphqlQueries,
    sentryDsn: getSentryDsn(),
    sentryTraceSampleRate: getSentryTraceSampleRate(),
    sentryReplaysSampleRate: getSentryReplaysSampleRate(),
  };
  return config;
}

const PUBLIC_ENV_VARS = [
  'WATCH_BACKEND_URL',
  'PATHS_BACKEND_URL',
  'DEPLOYMENT_TYPE',
  'WILDCARD_DOMAINS',
  'SENTRY_DSN',
  'SENTRY_TRACE_SAMPLE_RATE',
  'BUILD_ID',
  'AUTH_ISSUER',
];

export function getPublicEnvVariableNames() {
  return PUBLIC_ENV_VARS.filter((key) => key in process.env);
}

export function printRuntimeConfig(appName: string) {
  const runtimeConfig = getRuntimeConfig();
  if (!isLocal) {
    const logger = getLogger();
    logger.info({ runtimeConfig }, `${appName} starting`);
    return;
  }
  const p = (s: string) => (s + ':').padEnd(22);
  console.log(`${appName} (build ${runtimeConfig.buildId}) starting\n`);
  console.log(p('🌐 Node environment'), process.env.NODE_ENV);
  console.log(p('🚀 Deployment type'), runtimeConfig.deploymentType);
  console.log(p('🔑 OIDC auth issuer'), runtimeConfig.authIssuer);
  console.log(p('🔗 GraphQL backend URL'), runtimeConfig.gqlUrl);
  console.log(p('Wildcard domains'), runtimeConfig.wildcardDomains.join(', '));
  console.log(p('Sentry DSN'), runtimeConfig.sentryDsn);
  console.log(p('Asset prefix'), getAssetPrefix() || undefined);
}
