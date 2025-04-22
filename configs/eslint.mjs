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

  const config = ts.config(
    ...compat.extends('next/core-web-vitals', 'next/typescript', 'plugin:storybook/recommended'),
    [globalIgnores(['**/__generated__/**'])],
    ...ts.configs.recommendedTypeChecked,
    {
      plugins: {
        'react-compiler': reactCompiler,
      },
      ignores: ['src/common/__generated__/*'],
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
        '@typescript-eslint/consistent-type-imports': 'warn',
        '@typescript-eslint/no-require-imports': 'off',
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
