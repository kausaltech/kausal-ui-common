import type { TFunction } from '@common/i18n';

import { hasDimension } from './dimensions';
import type { NodeMetricInput, ParsedMetric } from './types';

/**
 * Get the metric name.
 */
export function getName(metric: ParsedMetric): string {
  return metric.name;
}

/**
 * Get the metric unit (HTML formatted).
 */
export function getUnit(metric: ParsedMetric): string {
  return metric.unit.htmlShort;
}

/**
 * Get the metric unit (short text).
 */
export function getUnitShort(metric: ParsedMetric): string {
  return metric.unit.short;
}

/**
 * Get the long HTML unit for display, overriding it for known emission units.
 */
export function overrideUnit(
  metric: ParsedMetric,
  unit: { htmlShort: string; htmlLong?: string | null; short?: string | null },
  t: TFunction
): string {
  let longUnit = unit.htmlShort;
  // FIXME: Nasty hack to show 'CO2e' where it might be applicable until
  // the backend gets proper support for unit specifiers.
  // t∕(Einw.·a)
  if (hasDimension(metric, 'emission_scope') && !hasDimension(metric, 'greenhouse_gases')) {
    if (unit.short === 't/Einw./a') {
      longUnit = t.raw('tco2-e-inhabitant') as string;
    } else if (unit.short === 'kt/a') {
      longUnit = t.raw('ktco2-e') as string;
    }
  }
  return longUnit;
}

/**
 * Get the year from which forecasts begin.
 */
export function getForecastFrom(metric: ParsedMetric): number | null {
  return metric.forecastFrom;
}

/**
 * Get all historical years (before forecastFrom).
 */
export function getHistoricalYears(metric: ParsedMetric): readonly number[] {
  return metric.years.filter((year) => (metric.forecastFrom ? year < metric.forecastFrom : true));
}

/**
 * Get all forecast years (from forecastFrom onwards).
 */
export function getForecastYears(metric: ParsedMetric): readonly number[] {
  return metric.years.filter((year) => (metric.forecastFrom ? year >= metric.forecastFrom : false));
}

/**
 * Check if a year is in the forecast period.
 */
export function isForecastYear(metric: ParsedMetric, year: number): boolean {
  return metric.forecastFrom != null && year >= metric.forecastFrom;
}

/**
 * Get the value for a specific year from a raw node metric (forecastValues / historicalValues).
 * Forecast values take precedence over historical values.
 */
export function getMetricValue(
  node: { metric: NodeMetricInput },
  year: number
): number | undefined {
  return (
    node.metric.forecastValues.find((dp) => dp.year === year)?.value ??
    node.metric.historicalValues.find((dp) => dp.year === year)?.value
  );
}

/**
 * Compute the percentage change between two metric values.
 * Returns undefined if the initial value is zero or undefined.
 */
export function getMetricChange(
  initial: number | undefined,
  current: number | undefined
): number | undefined {
  if (!initial || current === undefined) return undefined;
  return -Math.round(((initial - current) / initial) * 100);
}

/**
 * Sum the metric values of multiple nodes for a given year.
 */
export function getOutcomeTotal(nodes: { metric: NodeMetricInput }[], year: number): number {
  return nodes.reduce((acc, node) => acc + (getMetricValue(node, year) ?? 0), 0);
}
