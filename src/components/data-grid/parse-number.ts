/**
 * Parse a number as a person typed or pasted it.
 *
 * Excel copies what the cell *displays*, formatted in the user's own locale, so a
 * German workbook yields "1.234,5", an English one "1,234.5" and a Swiss one
 * "1'234.5". The string alone cannot settle "1.500" — one and a half, or fifteen
 * hundred? — so the UI locale breaks the tie, by what `Intl` says its decimal
 * separator is: "." is the decimal in `en` and `de-CH`, "," in `de`, `fi` and
 * `fr-CH`.
 *
 * Unambiguous marks are read the same in every locale:
 *
 * - Spaces (including the no-break spaces `fi` and `fr` group with) and
 *   apostrophes (' and ’, which Swiss locales group with) are always grouping.
 * - When both "." and "," appear, the rightmost is the decimal, since nobody
 *   writes a thousands separator after the decimal point.
 *
 * Returns `null` for an empty string (a cleared cell) and `undefined` for
 * something that is not a number, so the caller can tell "remove the value" from
 * "ignore this".
 */
export function parseLocaleNumber(input: string, locale: string): number | null | undefined {
  const text = input.trim().replace(GROUPING_MARKS, '');
  if (text === '') return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  let normalised: string;
  if (lastDot !== -1 && lastComma !== -1) {
    normalised =
      lastDot > lastComma ? text.replace(/,/g, '') : text.replace(/\./g, '').replace(',', '.');
  } else {
    const separator = lastComma !== -1 ? ',' : lastDot !== -1 ? '.' : null;
    if (separator === null) {
      normalised = text;
    } else {
      const parts = text.split(separator);
      const groupsOfThree =
        /^-?\d{1,3}$/.test(parts[0] ?? '') && parts.slice(1).every((p) => /^\d{3}$/.test(p));
      const isLocaleDecimal = separator === decimalSeparator(locale);
      if (groupsOfThree && (!isLocaleDecimal || parts.length > 2)) {
        // "1.500" in German, "1,500" in English, or "1,234,567" anywhere: grouping.
        normalised = parts.join('');
      } else if (parts.length === 2) {
        // One separator that cannot be grouping, or is the locale's decimal.
        normalised = parts.join('.');
      } else {
        return undefined;
      }
    }
  }

  const value = Number(normalised);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Marks that only ever group digits: whitespace (incl. U+00A0 and U+202F), the
 * ASCII apostrophe and U+2019 (Swiss grouping — CLDR moved from one to the other,
 * so both are in circulation), and U+02BC, which some keyboards produce instead.
 */
const GROUPING_MARKS = /[\s\u00a0\u202f'\u2019\u02bc]/g;

const decimalSeparators = new Map<string, ',' | '.'>();

function decimalSeparator(locale: string): ',' | '.' {
  let separator = decimalSeparators.get(locale);
  if (separator === undefined) {
    let decimal: string | undefined;
    try {
      decimal = new Intl.NumberFormat(locale)
        .formatToParts(1.5)
        .find((part) => part.type === 'decimal')?.value;
    } catch {
      // An invalid locale tag: fall through to the default.
    }
    separator = decimal === ',' ? ',' : '.';
    decimalSeparators.set(locale, separator);
  }
  return separator;
}
