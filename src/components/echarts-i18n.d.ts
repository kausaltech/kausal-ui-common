/**
 * ECharts ships its `i18n/lang*-obj` locale packs as UMD files with no type
 * declarations. They spread the locale object straight onto `exports`, so the
 * CommonJS default import is the locale itself.
 *
 * The `.js` suffix is part of the specifier: echarts maps `"./i18n/*"` to
 * `"./i18n/*"` in its exports field, adding no extension of its own.
 */
declare module 'echarts/i18n/*-obj.js' {
  // A top-level `import type` would turn this file into a module, which would
  // demote the wildcard declaration from an ambient module to an augmentation
  // of a module that does not exist. Hence the inline import.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const locale: Parameters<typeof import('echarts/core').registerLocale>[1];
  export default locale;
}
