// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import reactCompiler from 'eslint-plugin-react-compiler';
import { globalIgnores } from 'eslint/config';
import ts from 'typescript-eslint';

/**
 *
 * @param {string} rootDir
 * @returns {import('@typescript-eslint/utils').TSESLint.FlatConfig.ConfigArray}
 */
export function getEslintConfig(rootDir) {
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

  const config = ts.config(
    ...compat.extends('next/core-web-vitals', 'next/typescript'),
    [globalIgnores(['**/__generated__/**', '.next/**', '.*/**', 'Attic/**'])],
    ...ts.configs.recommendedTypeChecked,
    {
      plugins: {
        'react-compiler': reactCompiler,
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
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDir,
        },
      },
    }
  );
  return config;
}
