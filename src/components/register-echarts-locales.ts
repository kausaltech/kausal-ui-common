import * as echarts from 'echarts/core';

type LocaleOption = Parameters<typeof echarts.registerLocale>[1];

// The plain `echarts/i18n/lang*` files are UMD modules that only
// side-effect-register themselves under their own name and export NOTHING —
// importing them here used to register `undefined` for every alias below,
// silently falling back to English. The `-obj` variants export the locale
// object (spread onto the exports object, no `.default`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (name: string) => require(`echarts/i18n/${name}-obj`) as LocaleOption;

const cs = load('langCS');
const de = load('langDE');
const en = load('langEN');
const es = load('langES');
const fi = load('langFI');
const pl = load('langPL');
const ptBr = load('langPT-br');
const sv = load('langSV');

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
