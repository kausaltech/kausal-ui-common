import * as echarts from 'echarts/core';
// The plain `echarts/i18n/lang*` files are UMD modules that only
// side-effect-register themselves under their own name and export NOTHING —
// importing them here used to register `undefined` for every alias below,
// silently falling back to English. The `-obj` variants spread the locale
// object onto `exports`, so the CommonJS default import is the locale itself.
//
// These have to be static imports: a `require()` here resolved fine under
// webpack but threw `require is not defined` under any ESM-native loader,
// which broke the Vite-based Storybook/Vitest run.
import cs from 'echarts/i18n/langCS-obj.js';
import de from 'echarts/i18n/langDE-obj.js';
import en from 'echarts/i18n/langEN-obj.js';
import es from 'echarts/i18n/langES-obj.js';
import fi from 'echarts/i18n/langFI-obj.js';
import pl from 'echarts/i18n/langPL-obj.js';
import ptBr from 'echarts/i18n/langPT-br-obj.js';
import sv from 'echarts/i18n/langSV-obj.js';

type LocaleOption = Parameters<typeof echarts.registerLocale>[1];

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
