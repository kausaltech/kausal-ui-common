import type { ConfigWithExtends, ExtendsElement } from '@eslint/config-helpers';
import type { ConfigObject, Plugin as ESLintPlugin } from '@eslint/core';
import jsEslint from '@eslint/js';
import graphqlPlugin from '@graphql-eslint/eslint-plugin';
import type { ParserOptions as TSEslintParserOptions } from '@typescript-eslint/types';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

const JS_EXTS = '@(ts|js)';
const ALL_EXTS = '@(ts|tsx|js|jsx)';

function allExtsForPath(path: string, exts: string) {
  if (!path) return `*.${exts}`;
  return `${path}/*.${exts}`;
}

function allJsExtsForPath(path: string, jsx = false) {
  return allExtsForPath(path, jsx ? ALL_EXTS : JS_EXTS);
}

type ReactConfigOptions = {
  defaultProject?: string;
  dirs?: string[];
};

export function getReactConfig(opts: ReactConfigOptions) {
  const files = opts.dirs?.map((dir) => allJsExtsForPath(`${dir}/**`, true)) ?? [];
  return {
    name: 'react',
    extends: [
      { name: jsEslint.meta.name, rules: jsEslint.configs.recommended.rules },
      tsEslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat['recommended-latest'],
    ],
    settings: {
      react: {
        version: '19',
      },
    },
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        projectService: {
          defaultProject: opts.defaultProject,
        },
      } satisfies TSEslintParserOptions,
    },
    files,
    rules: {
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    },
  } satisfies ConfigWithExtends;
}

export async function getNextEslintConfig(dirs: string[]) {
  const nextEslintConfig = (await import('eslint-config-next/core-web-vitals')).default;

  const reactConfig = getReactConfig({
    dirs,
  });

  const files = dirs.map((dir) => allJsExtsForPath(`${dir}/**`, true));
  return [
    {
      extends: nextEslintConfig,
      name: 'next',
      files,
    },
    {
      ...reactConfig,
      files,
      rules: getDefaultTSRules(),
    },
  ] satisfies ConfigWithExtends[];
}

type FilesOrDirs = {
  files?: string[];
  /** JS files will get the typical extensions added to them. */
  jsDirs?: string[];
};

export function getGraphQLProcessorConfig(targets: FilesOrDirs) {
  const files = targets.files ?? [];
  const jsDirs = (targets.jsDirs ?? []).map((dir) => allJsExtsForPath(`${dir}/**`, true));
  return {
    name: 'graphql-processor',
    files: [...files, ...jsDirs],
    processor: graphqlPlugin.processor,
    plugins: {
      '@graphql-eslint': graphqlPlugin as ESLintPlugin,
    },
  } satisfies ConfigObject;
}

export function getGraphQLDocsConfig(dirs: string[]) {
  return {
    name: 'graphql-docs',
    files: dirs.map((dir) => `${dir}/**/*.graphql`),
    languageOptions: {
      parser: graphqlPlugin.parser,
    },
    rules: graphqlPlugin.configs['flat/operations-recommended'].rules,
    plugins: {
      '@graphql-eslint': graphqlPlugin as ESLintPlugin,
    },
  } satisfies ConfigObject;
}

export async function getStorybookConfig(files: string[]) {
  const storybookPlugin = (await import('eslint-plugin-storybook')).default;
  return {
    name: 'storybook',
    files,
    extends: storybookPlugin.configs['flat/recommended'] as ExtendsElement[],
  } satisfies ConfigWithExtends;
}

export function getGlobalIgnores() {
  return globalIgnores([
    'node_modules/**',
    '**/node_modules/**',
    '**/.pnpm-store/**',
    '**/__generated__/**',
    'load-tests/**',
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    '**/playwright-report/**',
    '.*/**',
    'Attic/**',
    'next-env.d.ts',
  ]);
}

type NodeConfigOptions = {
  dirs?: string[];
  files?: string[];
  defaultProject?: string;
};

function getDefaultTSRules() {
  function getAnyRules(level: 'warn' | 'error') {
    return {
      '@typescript-eslint/no-unsafe-assignment': level,
      '@typescript-eslint/no-unsafe-argument': level,
      '@typescript-eslint/no-unsafe-return': level,
      '@typescript-eslint/no-unsafe-member-access': level,
      '@typescript-eslint/no-explicit-any': level,
      '@typescript-eslint/consistent-type-imports': level,
    };
  }
  return {
    ...getAnyRules('error'),
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        enableAutofixRemoval: {
          imports: true,
        },
      },
    ],
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-deprecated': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': [
      'error',
      {
        ignorePrimitives: {
          string: true,
        },
      },
    ],
  } satisfies ConfigObject['rules'];
}

export function getNodeConfig(opts: NodeConfigOptions) {
  const files = opts.files ?? [];
  const dirs = (opts.dirs ?? []).map((dir) => allJsExtsForPath(`${dir}/**`, false));
  const defaultProject = opts.defaultProject;
  return {
    name: 'node',
    files: [...files, ...dirs],
    extends: [
      { name: jsEslint.meta.name, rules: jsEslint.configs.recommended.rules },
      tsEslint.configs.strictTypeChecked,
      tsEslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        projectService: {
          defaultProject,
        },
      } satisfies TSEslintParserOptions,
      globals: globals.node,
    },
    rules: getDefaultTSRules(),
  } satisfies ConfigWithExtends;
}
