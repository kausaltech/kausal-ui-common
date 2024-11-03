// @ts-check

/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
  trailingComma: 'es5',
  tabWidth: 2,
  printWidth: 100,
  semi: true,
  singleQuote: true,
  importOrder: [
    '^node:',
    '^react(-dom)?$',
    '^next/',
    '<THIRD_PARTY_MODULES>',
    '^@common/',
    '^@/',
    '^[./]',
  ],
  singleAttributePerLine: false,
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};

export default config;
