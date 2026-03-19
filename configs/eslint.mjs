// @ts-check
import jsEslint from '@eslint/js';
import graphqlPlugin from '@graphql-eslint/eslint-plugin';
// @ts-expect-error - weird import problems
import nextEslintConfigModule from 'eslint-config-next/core-web-vitals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tsEslint from 'typescript-eslint';

const JS_EXTS = '@(ts|tsx|js|jsx|mjs|cjs)';

/** @type {import('eslint-config-next/dist/core-web-vitals')} */
const nextEslintConfig = nextEslintConfigModule;

/**
 * @param {string} path
 * @param {string} exts
 * @returns {string}
 */
function allExtsForPath(path, exts = JS_EXTS) {
  if (!path) return `*.${exts}`;
  return `${path}/*.${exts}`;
}

function getNextEslintConfig() {
  /** @type {import('eslint/config').Config[]} */
  const nextConfig = defineConfig({
    name: 'ts',
    extends: [
      { name: jsEslint.meta.name, rules: jsEslint.configs.recommended.rules },
      tsEslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      reactHooks.configs.flat['recommended-latest'],
      nextEslintConfig,
    ],
    settings: {
      react: {
        version: '19',
      },
    },
    languageOptions: {
      parser: tsEslint.parser,
    },
  });
  return nextConfig;
}

/**
 *
 * @param {string} rootDir
 * @returns {Promise<import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray>}
 */
export async function getEslintConfig(rootDir) {
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

  /**
   * @param {string} exts
   * @returns {string[]}
   */
  function getJsFiles(exts = JS_EXTS) {
    const files = [];
    files.push(allExtsForPath('', exts));
    files.push(allExtsForPath('src/**', exts));
    files.push(allExtsForPath('e2e-tests/**', exts));
    files.push(allExtsForPath('kausal_common/src/**', exts));
    files.push(allExtsForPath('kausal_common/e2e-tests/**', exts));
    if (storybookConfigs.length > 0) {
      files.push(allExtsForPath('stories/**', exts));
    }
    return files;
  }

  const storybookConfigs = [];
  try {
    // @ts-expect-error - optional dependency, not installed in all consuming projects
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const storybookPlugin = (await import('eslint-plugin-storybook')).default;
    storybookConfigs.push(
      defineConfig({
        name: 'storybook',
        files: [allExtsForPath('stories/**')],
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        extends: storybookPlugin.configs['flat/recommended'],
      })
    );
  } catch (_e) {
    console.log('No storybook plugin found');
  }

  const nextConfig = getNextEslintConfig();

  const ignores = globalIgnores([
    'node_modules/**',
    '**/node_modules/**',
    '**/__generated__/**',
    'load-tests/**',
    'kausal_common/scripts/*.js',
    '.next/**',
    'out/**',
    'build/**',
    '**/playwright-report/**',
    '.*/**',
    'Attic/**',
    'next-env.d.ts',
  ]);
  const config = defineConfig(
    ignores,
    {
      name: 'graphql-only',
      files: ['src/**/*.graphql'],
      languageOptions: {
        parser: graphqlPlugin.parser,
      },
      rules: graphqlPlugin.configs['flat/operations-recommended'].rules,
      plugins: {
        // @ts-expect-error - some slight type incompatibilities
        '@graphql-eslint': graphqlPlugin,
      },
    },
    ...storybookConfigs,
    {
      name: 'main',
      files: getJsFiles(),
      extends: [nextConfig],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDir,
        },
      },
      rules: {
        'no-prototype-builtins': 'off',
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
            enableAutofixRemoval: {
              imports: true,
            },
          },
        ],
        'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
        ...getAnyRules('error'),
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/no-deprecated': 'warn',
      },
    },
    {
      name: 'kausal_common-tsconfig',
      files: [allExtsForPath('kausal_common/src/**')],
      languageOptions: {
        parserOptions: {
          tsconfigRootDir: `${rootDir}/kausal_common`,
        },
      },
    },
    {
      name: 'e2e-tests-tsconfig',
      files: [allExtsForPath('e2e-tests/**'), allExtsForPath('kausal_common/e2e-tests/**')],
      languageOptions: {
        parserOptions: {
          projectService: {
            defaultProject: 'e2e-tests/tsconfig.json',
          },
        },
      },
      rules: {
        'react-hooks/rules-of-hooks': 'off',
      },
    },
    {
      name: 'storybook-tsconfig',
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
      name: 'graphql-eslint',
      files: [allExtsForPath('src/**')],
      processor: graphqlPlugin.processor,
      plugins: {
        '@graphql-eslint': graphqlPlugin,
      },
    }
  );
  return config;
}
