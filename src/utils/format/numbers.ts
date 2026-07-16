/**
 * Creates an Intl.NumberFormat-based formatter with optional significant digits
 * and/or fraction digits constraints.
 *
 * When both are provided, significant digits are applied first via toPrecision,
 * then fraction digits cap the output — since Intl.NumberFormat cannot apply
 * both constraints simultaneously.
 */
export function makeFormatter(
  locale: string,
  significantDigits?: number,
  fractionDigits?: number
): { format: (value: number) => string } {
  // Clamp to Intl.NumberFormat valid ranges; treat out-of-range/zero as unset.
  const sigDigits =
    significantDigits && significantDigits >= 1 && significantDigits <= 21
      ? significantDigits
      : undefined;
  // Cap at 20, the maximum guaranteed across all JS engines. The Intl NumberFormat v3
  // spec raised the ceiling to 100, but older engines still enforce 20 and throw a
  // RangeError for anything higher (Sentry WATCH-UI-7MP).
  const fracDigits =
    fractionDigits !== undefined && fractionDigits >= 0
      ? Math.min(fractionDigits, 20)
      : undefined;
  if (typeof sigDigits === 'number' && typeof fracDigits === 'number') {
    // Significant digits wins for rounding; fraction digits caps the display.
    const fracFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: fracDigits });
    return {
      format: (value) => fracFormatter.format(parseFloat(value.toPrecision(sigDigits))),
    };
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fracDigits,
    maximumSignificantDigits: sigDigits,
  });
}

/**
 * Formats a number using the given formatter.
 * Returns '-' for null, undefined, or NaN.
 */
export function formatWithFormatter(
  formatter: { format: (value: number) => string },
  value: number | null | undefined
): string {
  if (value == null || Number.isNaN(value)) return '-';
  return formatter.format(value);
}
