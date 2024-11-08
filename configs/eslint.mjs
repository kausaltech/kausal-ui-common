// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
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
    ...ts.configs.recommendedTypeChecked,
    {
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
