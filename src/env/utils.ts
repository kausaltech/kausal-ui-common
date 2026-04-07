/* istanbul ignore file */

const FALSY_ENV_VALUES = new Set(['false', 'f', 'n', 'no', 'off', '0']);
const TRUTHY_ENV_VALUES = new Set(['true', 't', 'y', 'yes', 'on', '1']);

export function coerceToBool(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  const strValue = String(value as unknown)
    .toLowerCase()
    .trim();
  if (!strValue.length) return null;
  if (FALSY_ENV_VALUES.has(strValue)) {
    return false;
  }
  if (TRUTHY_ENV_VALUES.has(strValue)) {
    return true;
  }
  return null;
}

export function envToBool(value: unknown, defaultValue: boolean): boolean {
  const boolValue = coerceToBool(value);
  if (boolValue !== null) return boolValue;
  return defaultValue;
}
