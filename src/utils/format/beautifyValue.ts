import { DEFAULT_SIGNIFICANT_DIGITS } from './index';

/**
 * fractionDigits overrides significant digits
 */
export const beautifyValue = (
  x: number,
  locale?: string,
  significantDigits?: number,
  fractionDigits?: number
): string => {
  if (!significantDigits) significantDigits = DEFAULT_SIGNIFICANT_DIGITS;
  if (!locale) locale = undefined;

  if (!x) return '-';

  if (typeof fractionDigits === 'number') {
    return x.toLocaleString(locale, { maximumFractionDigits: fractionDigits });
  }

  const rounded =
    Math.abs(x) < 1
      ? Number(x.toFixed(significantDigits))
      : Number(x.toPrecision(significantDigits));

  return rounded.toLocaleString(locale);
};
