import * as echarts from 'echarts/core';

type LocaleOption = Parameters<typeof echarts.registerLocale>[1];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (name: string) =>
  (require(`echarts/i18n/${name}`) as { default: LocaleOption }).default;

const cs = load('langCS');
const de = load('langDE');
const es = load('langES');
const fi = load('langFI');
const pl = load('langPL');
const ptBr = load('langPT-br');
const sv = load('langSV');

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
