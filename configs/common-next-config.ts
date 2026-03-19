import * as fs from 'node:fs';
import * as path from 'node:path';

import { CycloneDxWebpackPlugin } from '@cyclonedx/webpack-plugin';
import type { NextConfig } from 'next';
import type * as Webpack from 'webpack';

import { getProjectIdFromPackageJson } from '../src/env/project';
import { getSentryWebpackDefines } from '../src/sentry/sentry-next-config';

const isProd = process.env.NODE_ENV === 'production';
const standaloneBuild = process.env.NEXTJS_STANDALONE_BUILD === '1';
const prodAssetPrefix = isProd ? process.env.NEXTJS_ASSET_PREFIX : undefined;

const isCoverageEnabled = process.env.CODE_COVERAGE === '1';

export function getNextConfig(projectRoot: string): NextConfig {
  const config: NextConfig = {
    assetPrefix: prodAssetPrefix,
    output: standaloneBuild ? 'standalone' : undefined,
    typescript: {
      ignoreBuildErrors: true,
    },
    distDir: isCoverageEnabled ? '.next-coverage' : undefined,
    productionBrowserSourceMaps: true,
    compiler: {
      emotion: {
        autoLabel: 'always',
        labelFormat: '[filename]-[local]',
        importMap: {
          '@mui/system': {
            styled: {
              canonicalImport: ['@emotion/styled', 'default'],
              styledBaseImport: ['@mui/system', 'styled'],
            },
          },
          '@mui/material/styles': {
            styled: {
              canonicalImport: ['@emotion/styled', 'default'],
              styledBaseImport: ['@mui/material/styles', 'styled'],
            },
          },
          '@mui/material': {
            styled: {
              canonicalImport: ['@emotion/styled', 'default'],
              styledBaseImport: ['@mui/material', 'styled'],
            },
          },
          '@common/themes/styled': {
            styled: {
              canonicalImport: ['@emotion/styled', 'default'],
              styledBaseImport: ['@common/themes/styled', 'styled'],
            },
          }
        },
      },
      define: {
        ...getCommonDefines(projectRoot, false),
      },
    },
    experimental: {
      serverMinification: false,
      serverSourceMaps: true,
      optimizePackageImports: ['lodash'],
      // forceSwcTransforms: !envToBool(process.env.CODE_COVERAGE, false),
      // reactCompiler: true,
      swcPlugins: isCoverageEnabled
        ? [
            [
              'swc-plugin-coverage-instrument',
              {
                unstableExclude: [
                  '**/kausal_common/src/env/*.ts',
                  '**/kausal_common/src/logging/**',
                  '**/node_modules/**',
                  '**/node_modules/.pnpm/**',
                  '**/src/instrumentation*',
                  '**/src/middleware.ts',
                  '**/src/utils/middleware.utils.ts',
                ],
              },
            ],
          ]
        : undefined,
    },
    reactStrictMode: true,
    skipProxyUrlNormalize: true,
    // Bundle all node_modules for server-side Pages Router (like App Router).
    // Without this, Turbopack externalizes most packages but @mui/material
    // is force-bundled (via optimizePackageImports), pulling in its own
    // inline copy of @emotion/react. The app code's externalized emotion
    // creates a separate EmotionCacheContext, causing css-/mui- class
    // prefix mismatch and hydration errors.
    bundlePagesRouterDependencies: true,
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
    webpack: (cfg: Webpack.Configuration, context) => {
      const { isServer, dev, nextRuntime } = context;
      const isEdge = isServer && nextRuntime === 'edge';
      const _webpack = context.webpack as typeof Webpack;
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
        if (!isEdge) {
          cfg.target = 'node22';
        }
      } else {
        // Stub out Node.js built-ins for client bundle; loadMessages.ts is
        // imported dynamically from _app.tsx but only executed server-side.
        cfg.resolve.fallback = {
          ...cfg.resolve.fallback,
          fs: false,
          path: false,
        };
        cfg.resolve.symlinks = true;
        cfg.optimization = {
          ...cfg.optimization,
          minimize: false,
        };
      }
      if (!dev) cfg.devtool = 'source-map';
      /*
      const defines = {
        ...getCommonDefines(projectRoot, isServer),
      };
      cfg.plugins.push(new webpack.DefinePlugin(defines));
      */
      if (!dev) {
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
        if (!isCoverageEnabled) {
          const sbomComponent = isServer ? (isEdge ? 'edge' : 'node') : 'browser';
          const webpackOutputPath = cfg.output!.path!;
          const sbomOutputPath = `${context.dir}/public/static/sbom/${sbomComponent}`;
          const buildVersion = (process.env.BUILD_ID || 'unknown').replaceAll('_', '-');
          cfg.plugins.push(
            new CycloneDxWebpackPlugin({
              outputLocation: path.relative(webpackOutputPath, sbomOutputPath),
              rootComponentVersion: `1.0.0-${buildVersion}`,
              rootComponentAutodetect: false,
              rootComponentName: `${getProjectIdFromPackageJson(context.dir)}-${sbomComponent}`,
              includeWellknown: false,
            })
          );
        }
      }
      return cfg;
    },
  };
  return config;
}

export function getCommonDefines(projectRoot: string, stringify: boolean = true) {
  function maybeStringify(value: string) {
    return stringify ? JSON.stringify(value) : value;
  }

  const defines = {
    'globalThis.__DEV__': isProd ? 'false' : 'true',
    'process.env.PROJECT_ID': maybeStringify(getProjectIdFromPackageJson(projectRoot)),
    'process.env.NEXTJS_ASSET_PREFIX': maybeStringify(prodAssetPrefix || ''),
    ...getSentryWebpackDefines(stringify),
  };
  return defines;
}
