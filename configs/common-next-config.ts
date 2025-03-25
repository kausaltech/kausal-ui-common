import type { NextConfig } from 'next';

import { getProjectIdFromPackageJson } from '../src/env/project.cjs';
import { getSentryWebpackDefines } from '../src/sentry/sentry-next-config';
import { initializeThemes } from '../src/themes/next-config.mjs';
import type { Options as SassOptions } from 'sass';

const isProd = process.env.NODE_ENV === 'production';
const standaloneBuild = process.env.NEXTJS_STANDALONE_BUILD === '1';
const prodAssetPrefix = isProd ? process.env.NEXTJS_ASSET_PREFIX : undefined;

export function getNextConfig(projectRoot: string): NextConfig {
  initializeThemes(projectRoot);

  const config: NextConfig = {
    assetPrefix: prodAssetPrefix,
    sassOptions: {
      quietDeps: true,
      silenceDeprecations: ['import', 'legacy-js-api', 'color-functions', 'global-builtin', 'color-4-api'],
    } satisfies SassOptions<'sync'>,
    output: standaloneBuild ? 'standalone' : undefined,
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    productionBrowserSourceMaps: true,
    compiler: {
      // Enables the styled-components SWC transform
      styledComponents: true,
    },
    experimental: {
      optimizePackageImports: ['lodash'],
      nodeMiddleware: true,
      clientInstrumentationHook: true,
    },
    reactStrictMode: true,
    skipMiddlewareUrlNormalize: true,
    serverExternalPackages: ['pino'],
    outputFileTracingIncludes: standaloneBuild
      ? { '/': ['./node_modules/@kausal*/themes*/**'] }
      : undefined,
    // eslint-disable-next-line @typescript-eslint/require-await
    generateBuildId: async () => {
      if (process.env.NEXTJS_BUILD_ID) return process.env.NEXTJS_BUILD_ID;
      // If a fixed Build ID was not provided, fall back to the default implementation.
      return null;
    },
  };
  return config;
}

export function getCommonDefines(projectRoot: string, isServer: boolean) {
  const defines = {
    'globalThis.__DEV__': isProd ? 'false' : 'true',
    'process.env.PROJECT_ID': JSON.stringify(getProjectIdFromPackageJson(projectRoot)),
    'process.env.NEXTJS_ASSET_PREFIX': JSON.stringify(prodAssetPrefix || ''),
    ...getSentryWebpackDefines(isServer),
  };
  if (!isServer) {
    defines['process.env.DEPLOYMENT_TYPE'] = JSON.stringify(
      process.env.DEPLOYMENT_TYPE ?? process.env.NEXT_PUBLIC_DEPLOYMENT_TYPE ?? null
    );
  }
  return defines;
}
