/// <reference path="./echarts-i18n.d.ts" />
import * as echarts from 'echarts/core';

// The plain `echarts/i18n/lang*` files are UMD modules that only
// side-effect-register themselves under their own name and export NOTHING —
// importing them here used to register `undefined` for every alias below,
// silently falling back to English. The `-obj` variants export the locale
// object (their `module.exports`, which ESM interop maps to the default
// import). Static imports are required so this works under both webpack
// (Next.js) and Vite (Storybook), where top-level `require()` is unavailable.
import langCS from 'echarts/i18n/langCS-obj.js';
import langDE from 'echarts/i18n/langDE-obj.js';
import langEN from 'echarts/i18n/langEN-obj.js';
import langES from 'echarts/i18n/langES-obj.js';
import langFI from 'echarts/i18n/langFI-obj.js';
import langPL from 'echarts/i18n/langPL-obj.js';
import langPTBr from 'echarts/i18n/langPT-br-obj.js';
import langSV from 'echarts/i18n/langSV-obj.js';

type LocaleOption = Parameters<typeof echarts.registerLocale>[1];

const cs = langCS as LocaleOption;
const de = langDE as LocaleOption;
const en = langEN as LocaleOption;
const es = langES as LocaleOption;
const fi = langFI as LocaleOption;
const pl = langPL as LocaleOption;
const ptBr = langPTBr as LocaleOption;
const sv = langSV as LocaleOption;

const localeStrings: Record<string, LocaleOption> = {
  cs,
  de,
  'de-CH': de,
  en,
  es,
  'es-US': es,
  fi,
  pl,
  'pt-BR': ptBr,
  sv,
  'sv-FI': sv,
};

/**
 * Raw locale-pack strings (aria sentence templates, series type names) for
 * composing custom accessibility descriptions in ECharts' own style.
 * Falls back to English for locales without a registered pack.
 */
export function getEChartsLocaleStrings(locale: string): LocaleOption {
  return localeStrings[locale] ?? localeStrings[locale.split('-')[0]] ?? en;
}

echarts.registerLocale('cs', cs);
echarts.registerLocale('de', de);
echarts.registerLocale('de-CH', de);
echarts.registerLocale('es', es);
echarts.registerLocale('es-US', es);
echarts.registerLocale('fi', fi);
echarts.registerLocale('pl', pl);
echarts.registerLocale('pt-BR', ptBr);
echarts.registerLocale('sv', sv);
echarts.registerLocale('sv-FI', sv);
