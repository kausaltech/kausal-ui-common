//@ts-check

const FALSY_ENV_VALUES = new Set(['false', 'f', 'n', 'no', 'off', '0']);
const TRUTHY_ENV_VALUES = new Set(['true', 't', 'y', 'yes', 'on', '1']);

/**
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function coerceToBool(value) {
  if (value === null || value === undefined) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const strValue = String(value).toLowerCase().trim();
  if (!strValue.length) return null;
  if (FALSY_ENV_VALUES.has(strValue)) {
    return false;
  }
  if (TRUTHY_ENV_VALUES.has(strValue)) {
    return true;
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function envToBool(value, defaultValue) {
  const boolValue = coerceToBool(value);
  if (boolValue !== null) return boolValue;
  return defaultValue;
}
