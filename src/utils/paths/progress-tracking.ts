import type { MetricInput } from '@common/utils/paths/metric';

/*
 * Values of the Paths API's `ScenarioKind` enum. The apps' generated enums
 * have these values, so their scenarios are assignable to `SiteContextScenario`.
 */
const PROGRESS_TRACKING = 'PROGRESS_TRACKING';
const BASELINE = 'BASELINE';

export type SiteContextScenario = {
  id: string;
  kind: string | null;
  actualHistoricalYears?: readonly number[] | null;
};

export type SiteContextType = {
  scenarios: readonly SiteContextScenario[];
  minYear: number;
};

type Metric = Pick<MetricInput, 'dimensions'>;

function getScenariosFromMetric(metric: Metric) {
  const scenarioDim = metric.dimensions.find((dim) => dim.id.endsWith(':scenario:ScenarioName'));

  return scenarioDim?.categories ?? [];
}

export function getProgressTrackingScenario(scenarios: readonly SiteContextScenario[]) {
  return scenarios.find((scenario) => scenario.kind === PROGRESS_TRACKING);
}

export function getBaselineScenario(scenarios: readonly SiteContextScenario[]) {
  return (
    scenarios.find((scenario) => scenario.kind === BASELINE) ??
    scenarios.find((scenario) => scenario.id === 'baseline')
  );
}

function metricHasScenario(metric: Metric, scenario: SiteContextScenario | undefined) {
  if (!scenario) return false;
  return getScenariosFromMetric(metric).some((cat) => cat.originalId === scenario.id);
}

export function metricHasProgressTrackingScenario(
  metric: Metric,
  scenarios: readonly SiteContextScenario[]
) {
  return metricHasScenario(metric, getProgressTrackingScenario(scenarios));
}

export function metricHasBaselineScenario(
  metric: Metric,
  scenarios: readonly SiteContextScenario[]
) {
  return metricHasScenario(metric, getBaselineScenario(scenarios));
}

export function hasProgressTracking(
  metric: Metric,
  scenarios: readonly SiteContextScenario[],
  minYear: number
) {
  return (
    metricHasProgressTrackingScenario(metric, scenarios) &&
    !!getProgressTrackingScenario(scenarios)?.actualHistoricalYears?.filter(
      (year) => year !== minYear
    ).length
  );
}

export function getLatestProgressYear(site: SiteContextType) {
  const progressTrackingScenario = getProgressTrackingScenario(site.scenarios);
  const progressYears =
    progressTrackingScenario?.actualHistoricalYears
      ?.filter((year) => year !== site.minYear)
      .sort((a, b) => b - a) ?? [];

  return progressYears[0] ?? null;
}
