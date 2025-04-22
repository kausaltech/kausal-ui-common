import * as fs from 'node:fs';

import type { NextConfig } from 'next';
import type { Options as SassOptions } from 'sass';
import type * as Webpack from 'webpack';

import { getProjectIdFromPackageJson } from '../src/env/project.cjs';
import { getSentryWebpackDefines } from '../src/sentry/sentry-next-config';
import { initializeThemes } from '../src/themes/next-config.mjs';

const isProd = process.env.NODE_ENV === 'production';
const standaloneBuild = process.env.NEXTJS_STANDALONE_BUILD === '1';
const prodAssetPrefix = isProd ? process.env.NEXTJS_ASSET_PREFIX : undefined;

export function getNextConfig(projectRoot: string, opts: { isPagesRouter?: boolean }): NextConfig {
  opts = opts || {};
  const { isPagesRouter = false } = opts;

  initializeThemes(projectRoot);

  const config: NextConfig = {
    assetPrefix: prodAssetPrefix,
    sassOptions: {
      quietDeps: true,
      silenceDeprecations: [
        'import',
        'legacy-js-api',
        'color-functions',
        'global-builtin',
        'color-4-api',
      ],
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
      clientInstrumentationHook: true,
      // forceSwcTransforms: !envToBool(process.env.CODE_COVERAGE, false),
      // reactCompiler: true,
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
    webpack: (cfg, context) => {
      const { isServer, dev } = context;
      const isEdge = isServer && context.nextRuntime === 'edge';
      const webpack = context.webpack as typeof Webpack;
      if (!cfg.resolve || !cfg.resolve.alias || !Array.isArray(cfg.plugins))
        throw new Error('cfg.resolve not defined');
      cfg.resolve.extensionAlias = {
        '.js': ['.ts', '.js'],
      };
      if (isServer) {
        cfg.optimization = {
          ...cfg.optimization,
          minimize: false, // do not minify server bundle for easier debugging
        };
        if (!isEdge) cfg.target = 'node22';
      } else {
        if (isPagesRouter) {
          cfg.resolve.alias['next-i18next/serverSideTranslations'] = false;
          cfg.resolve.alias['./next-i18next.config'] = false;
          cfg.resolve.alias['v8'] = false;
        }
        cfg.resolve.symlinks = true;
        cfg.optimization = {
          ...cfg.optimization,
          minimize: false,
        };
      }
      if (!dev) cfg.devtool = 'source-map';
      const defines = {
        ...getCommonDefines(projectRoot, isServer),
      };
      cfg.plugins.push(new webpack.DefinePlugin(defines));

      // Some of the external libraries have their own, non-functional source maps.
      // This loader will yoink those out of the build.
      cfg.module?.rules?.unshift({
        test: /\.js$/,
        enforce: 'pre',
        use: ['source-map-loader'],
      });
      // When determining code coverage, the webpack:// URLs confuse the coverage tool.
      // This template will use the absolute path to the file instead.
      cfg.output!.devtoolModuleFilenameTemplate = (info) => {
        const loaders = info.loaders ? `?${info.loaders}` : '';
        if (fs.existsSync(info.absoluteResourcePath)) {
          return `${info.absoluteResourcePath}`;
        }
        return `webpack://${info.namespace}/${info.resourcePath}${loaders}`;
      };
      return cfg;
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
