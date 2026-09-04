import { type DimensionalNodeMetricFragment, ScenarioKind } from '@/common/__generated__/graphql';

type SiteContextScenario = {
  id: string;
  kind: ScenarioKind;
  actualHistoricalYears?: number[] | null;
};

type SiteContextType = {
  scenarios: SiteContextScenario[];
  minYear: number;
};

type Metric = NonNullable<DimensionalNodeMetricFragment['metricDim']>;

function getScenariosFromMetric(metric: Metric) {
  const scenarioDim = metric.dimensions.find((dim) => dim.id.endsWith(':scenario:ScenarioName'));

  return scenarioDim?.categories ?? [];
}

export function getProgressTrackingScenario(scenarios: SiteContextScenario[]) {
  return scenarios.find((scenario) => scenario.kind === ScenarioKind.ProgressTracking);
}

export function metricHasProgressTrackingScenario(
  metric: Metric,
  scenarios: SiteContextScenario[]
) {
  const progressTrackingScenario = getProgressTrackingScenario(scenarios);

  if (!progressTrackingScenario) {
    return false;
  }

  const scenariosFromMetric = getScenariosFromMetric(metric);

  return !!scenariosFromMetric.find(
    (scenario) => scenario.originalId === progressTrackingScenario.id
  );
}

export function hasProgressTracking(
  metric: Metric,
  scenarios: SiteContextScenario[],
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
      ?.sort((a, b) => b - a) ?? [];

  return progressYears[0] ?? null;
}
