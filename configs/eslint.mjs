// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import graphqlPlugin from '@graphql-eslint/eslint-plugin';
import reactCompiler from 'eslint-plugin-react-compiler';
import { globalIgnores } from 'eslint/config';
import ts from 'typescript-eslint';

/**
 *
 * @param {string} rootDir
 * @returns {Promise<import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray>}
 */
export async function getEslintConfig(rootDir) {
  const compat = new FlatCompat({
    baseDirectory: rootDir,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
  });

  /**
   * @param {'warn' | 'error'} level
   * @returns {Record<string, 'warn' | 'error'>}
   */
  function getAnyRules(level) {
    return {
      '@typescript-eslint/no-unsafe-assignment': level,
      '@typescript-eslint/no-unsafe-argument': level,
      '@typescript-eslint/no-unsafe-return': level,
      '@typescript-eslint/no-unsafe-member-access': level,
      '@typescript-eslint/no-explicit-any': level,
      '@typescript-eslint/consistent-type-imports': level,
    };
  }

  const JS_EXTS = '@(ts|tsx|js|jsx|mjs|cjs)';

  function allExtsForPath(path) {
    return `${path}/*.${JS_EXTS}`;
  }

  function getJsFiles() {
    const files = [];
    files.push(allExtsForPath('.'));
    files.push(allExtsForPath('src/**'));
    files.push(allExtsForPath('e2e-tests/**'));
    files.push(allExtsForPath('kausal_common/**'));
    if (storybookConfigs.length > 0) {
      files.push(allExtsForPath('stories/**'));
    }
    return files;
  }

  const storybookConfigs = [];
  try {
    // @ts-expect-error - optional dependency, not installed in all consuming projects
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const storybookPlugin = (await import('eslint-plugin-storybook')).default;
    storybookConfigs.push(
      ts.config({
        files: [allExtsForPath('stories/**')],
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        extends: storybookPlugin.configs['flat/recommended'],
      })
    );
  } catch (_e) {}

  const nextConfig = compat.extends('next/core-web-vitals', 'next/typescript');
  const ignores = globalIgnores([
    'node_modules/**',
    '**/__generated__/**',
    'load-tests/**',
    'kausal_common/scripts/*.js',
    '.next/**',
    '.*/**',
    'Attic/**',
    'next-env.d.ts',
  ]);
  const config = ts.config(
    ignores,
    {
      files: ['src/**/*.graphql'],
      languageOptions: {
        parser: graphqlPlugin.parser,
      },
      rules: graphqlPlugin.configs['flat/operations-recommended'].rules,
      plugins: {
        '@graphql-eslint': graphqlPlugin,
      },
    },
    ...storybookConfigs,
    {
      files: getJsFiles(),
      extends: [nextConfig, ts.configs.recommendedTypeChecked],
      plugins: {
        'react-compiler': reactCompiler,
      },
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDir,
        },
      },
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
        'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
        ...getAnyRules('error'),
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/ban-ts-comment': 'warn',
        'react-compiler/react-compiler': 'error',
      },
    },
    {
      files: [allExtsForPath('e2e-tests/**')],
      languageOptions: {
        parserOptions: {
          projectService: {
            defaultProject: 'e2e-tests/tsconfig.json',
          },
        },
      },
    },
    {
      files: [allExtsForPath('stories/**')],
      languageOptions: {
        parserOptions: {
          projectService: {
            defaultProject: 'stories/tsconfig.json',
          },
        },
      },
    },
    {
      files: [allExtsForPath('src/**')],
      processor: graphqlPlugin.processor,
      plugins: {
        '@graphql-eslint': graphqlPlugin,
      },
    }
  );
  return config;
}
