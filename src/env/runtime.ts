import { getLogger } from '../logging';
import { coerceToBool, envToBool } from './utils';
import { getProjectId } from './static';

const isServer = typeof window === 'undefined';
const isLocal = process.env.NODE_ENV === 'development';

export type DeploymentType =
  'production'
  | 'staging'
  | 'development'
  | 'testing'
  | 'preview'
  | 'ci'
  | 'wip';

const KNOWN_DEPLOYMENT_TYPES = [
  'production',
  'staging',
  'development',
  'testing',
  'preview',
  'ci',
  'wip',
];

export const WINDOW_PUBLIC_ENV_KEY = '__PUBLIC_ENV';

export const PUBLIC_ENV_VARS: Record<string, keyof RuntimeConfig | undefined> = {
  WATCH_BACKEND_URL: undefined,
  PATHS_BACKEND_URL: undefined,
  DEPLOYMENT_TYPE: 'deploymentType',
  WILDCARD_DOMAINS: 'wildcardDomains',
  SENTRY_DSN: 'sentryDsn',
  SENTRY_TRACE_SAMPLE_RATE: 'sentryTraceSampleRate',
  BUILD_ID: 'buildId',
  AUTH_ISSUER: undefined,
};


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
  if (typeof window === 'undefined') {
    return process.env[key];
  }
  if (!Object.hasOwn(PUBLIC_ENV_VARS, key)) {
    throw new Error(`Unknown public environment variable: ${key}`);
  }
  const env = window[WINDOW_PUBLIC_ENV_KEY] as Record<string, string>;
  return env[key];
}

export function getDeploymentType(): DeploymentType {
  const val =
    env('DEPLOYMENT_TYPE') ||
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
    env('WILDCARD_DOMAINS');

  // In dev mode, default to `localhost` being a wildcard domain.
  if (!domains) return isLocal ? ['localhost'] : [];

  return domains.split(',').map((s) => s.toLowerCase());
}

export function getAuthIssuer() {
  return (
    env('AUTH_ISSUER') || getDefaultBackendUrl()
  );
}

export function getSentryDsn(): string | undefined {
  return env('SENTRY_DSN');
}

export function getBuildId(): string {
  const envVal = env('BUILD_ID');
  if (envVal) return envVal;
  return 'dev';
}

export function getAssetPrefix(): string {
  const envVal = process.env.NEXTJS_ASSET_PREFIX || '';
  if (envVal.endsWith('/')) {
    throw new Error("NEXTJS_ASSET_PREFIX must not end with '/'");
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

export const logGraphqlQueries =
  isServer && envToBool('LOG_GRAPHQL_QUERIES', false);

/**
 * Returns the URL to use for Spotlight, or null if Spotlight is not enabled.
 */
export function getSpotlightUrl() {
  if (!isLocal) return null;

  // The value below is set by the Webpack define plugin in browser builds..
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

export function getPublicEnv() {
  const keyVals = Object.keys(PUBLIC_ENV_VARS)
    .filter((key) => key in process.env)
    .map((key) => ([
      key,
      process.env[key]?.trim(),
    ]))
  return Object.fromEntries(keyVals) as Record<string, string>;
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
  if (isServer) {
    console.log(p('Asset prefix'), getAssetPrefix() || undefined);
  }
}
