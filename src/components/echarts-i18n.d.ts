/**
 * The echarts i18n files ship without type declarations. The `-obj` variants
 * are UMD modules whose `module.exports` is the locale object itself, which
 * ESM interop (webpack and Vite/esbuild alike) exposes as the default import.
 */
declare module 'echarts/i18n/*' {
  const locale: unknown;
  export default locale;
}
