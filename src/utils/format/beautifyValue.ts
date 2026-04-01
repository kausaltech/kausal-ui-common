export const DEFAULT_SIGNIFICANT_DIGITS = 3;

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

  const rounded = Number(x.toPrecision(significantDigits));

  return rounded.toLocaleString(locale);
};
