/**
 * Parse a number as a person typed or pasted it.
 *
 * Excel copies what the cell *displays*, formatted in the user's own locale, so a
 * German workbook yields "1.234,5" and an English one "1,234.5". The string alone
 * cannot settle "1.500" — one and a half, or fifteen hundred? — so the UI locale
 * breaks the tie: in German the dot groups thousands and the comma is the
 * decimal, in English the reverse. When both separators are present the
 * rightmost is the decimal whatever the locale, since nobody writes a thousands
 * separator after the decimal point.
 *
 * Returns `null` for an empty string (a cleared cell) and `undefined` for
 * something that is not a number, so the caller can tell "remove the value" from
 * "ignore this".
 */
export function parseLocaleNumber(input: string, locale: string): number | null | undefined {
  const text = input.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (text === '') return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  let normalised: string;
  if (lastDot !== -1 && lastComma !== -1) {
    normalised =
      lastDot > lastComma ? text.replace(/,/g, '') : text.replace(/\./g, '').replace(',', '.');
  } else {
    const decimalIsComma = locale.startsWith('de');
    const separator = lastComma !== -1 ? ',' : lastDot !== -1 ? '.' : null;
    if (separator === null) {
      normalised = text;
    } else {
      const parts = text.split(separator);
      const groupsOfThree =
        /^-?\d{1,3}$/.test(parts[0] ?? '') && parts.slice(1).every((p) => /^\d{3}$/.test(p));
      const isLocaleDecimal = (separator === ',') === decimalIsComma;
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
