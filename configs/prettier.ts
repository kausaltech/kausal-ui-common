import type { Config } from 'prettier';

const config: Config = {
  trailingComma: 'es5',
  tabWidth: 2,
  printWidth: 100,
  semi: true,
  singleQuote: true,
  importOrder: [
    '^node:',
    '<BUILTIN_MODULES>',
    '^react(-dom)?$',
    '^next/',
    '<SEPARATOR>',
    '^@mui/',
    '^@emotion/',
    '<SEPARATOR>',
    '<THIRD_PARTY_MODULES>',
    '<SEPARATOR>',
    '^@common/',
    '<SEPARATOR>',
    '^@/',
    '^[./]',
  ],
  singleAttributePerLine: false,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};

export default config;
