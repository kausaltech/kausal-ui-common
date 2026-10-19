import type {
  InstanceGoalInput,
  MetricCategoryGroupInput,
  MetricDimensionCategoryInput,
  MetricDimensionInput,
  MetricGoalInput,
  MetricInput,
} from '../types';

/*
 * Metric fixtures shaped like the Paths API's `DimensionalMetricType`. Ids are
 * prefixed like the backend's, so tests catch mix-ups between `id` and
 * `originalId`.
 */

type DimSpec = {
  key: string;
  label: string;
  helpText?: string;
  categories: { key: string; label: string; group?: string; order?: number; color?: string }[];
  groups?: { key: string; label: string; order?: number }[];
};

export const dimId = (metricId: string, key: string) => `${metricId}:${key}`;
export const catId = (metricId: string, dimKey: string, key: string) =>
  `${metricId}:${dimKey}:${key}`;

function makeDimension(metricId: string, spec: DimSpec): MetricDimensionInput {
  const groups: MetricCategoryGroupInput[] = (spec.groups ?? []).map((grp) => ({
    id: catId(metricId, spec.key, grp.key),
    originalId: grp.key,
    label: grp.label,
    color: null,
    order: grp.order ?? null,
  }));
  const categories: MetricDimensionCategoryInput[] = spec.categories.map((cat) => ({
    id: catId(metricId, spec.key, cat.key),
    originalId: cat.key,
    label: cat.label,
    color: cat.color ?? null,
    order: cat.order ?? null,
    group: cat.group ? catId(metricId, spec.key, cat.group) : null,
  }));
  return {
    id: dimId(metricId, spec.key),
    label: spec.label,
    originalId: spec.key,
    helpText: spec.helpText ?? null,
    categories,
    groups,
  };
}

/** The category keys of one data cell, by dimension key */
type Cell = Record<string, string>;

/**
 * Build a metric whose values come from `value(cell, year)`. Values are laid
 * out like the backend's: the first dimension outermost, years innermost.
 */
export function buildMetric(spec: {
  id: string;
  name: string;
  dimensions: DimSpec[];
  years: number[];
  forecastFrom: number | null;
  value: (cell: Cell, year: number) => number | null;
  goals?: MetricGoalInput[];
}): MetricInput {
  const values: (number | null)[] = [];
  const walk = (dimsLeft: DimSpec[], cell: Cell) => {
    const [dim, ...rest] = dimsLeft;
    if (!dim) {
      spec.years.forEach((year) => values.push(spec.value(cell, year)));
      return;
    }
    dim.categories.forEach((cat) => walk(rest, { ...cell, [dim.key]: cat.key }));
  };
  walk(spec.dimensions, {});

  return {
    id: spec.id,
    name: spec.name,
    dimensions: spec.dimensions.map((dim) => makeDimension(spec.id, dim)),
    goals: spec.goals ?? [],
    unit: { htmlShort: 'kt/a', short: 'kt/a' },
    stackable: true,
    normalizedBy: null,
    forecastFrom: spec.forecastFrom,
    years: spec.years,
    values,
  };
}

/*
 * EMISSIONS: three dimensions, two historical and two forecast years.
 *
 * - `gas` comes first but only CO2 has data (CH4 is all zeros), so it is not
 *   worth offering as a breakdown.
 * - `sector`: Waste is reported as zeros, Agriculture has no data at all.
 *   Transport has no indirect (scope 3) data.
 * - `scope` is grouped: scopes 1 and 2 are Direct, scope 3 is Indirect.
 *
 * CO2 values are `base + (year - 2020)`, except that a base of 0 stays 0:
 *
 *   base       scope1  scope2  scope3
 *   buildings  10      5       2
 *   transport  20      0       null
 *   waste      0       0       0
 *   agriculture null   null    null
 */
const CO2_BASE: Record<string, Record<string, number | null>> = {
  buildings: { scope1: 10, scope2: 5, scope3: 2 },
  transport: { scope1: 20, scope2: 0, scope3: null },
  waste: { scope1: 0, scope2: 0, scope3: 0 },
  agriculture: { scope1: null, scope2: null, scope3: null },
};

export const EMISSIONS_ID = 'emissions';
export const em = {
  gas: dimId(EMISSIONS_ID, 'gas'),
  sector: dimId(EMISSIONS_ID, 'sector'),
  scope: dimId(EMISSIONS_ID, 'scope'),
  co2: catId(EMISSIONS_ID, 'gas', 'co2'),
  ch4: catId(EMISSIONS_ID, 'gas', 'ch4'),
  buildings: catId(EMISSIONS_ID, 'sector', 'buildings'),
  transport: catId(EMISSIONS_ID, 'sector', 'transport'),
  waste: catId(EMISSIONS_ID, 'sector', 'waste'),
  agriculture: catId(EMISSIONS_ID, 'sector', 'agriculture'),
  scope1: catId(EMISSIONS_ID, 'scope', 'scope1'),
  scope2: catId(EMISSIONS_ID, 'scope', 'scope2'),
  scope3: catId(EMISSIONS_ID, 'scope', 'scope3'),
  direct: catId(EMISSIONS_ID, 'scope', 'direct'),
  indirect: catId(EMISSIONS_ID, 'scope', 'indirect'),
};

export const EMISSIONS_GOAL_VALUES = {
  all: [{ year: 2023, value: 40, isInterpolated: false }],
  buildings: [{ year: 2023, value: 20, isInterpolated: false }],
};

export const emissions = buildMetric({
  id: EMISSIONS_ID,
  name: 'Greenhouse gas emissions',
  years: [2020, 2021, 2022, 2023],
  forecastFrom: 2022,
  dimensions: [
    {
      key: 'gas',
      label: 'Gas',
      categories: [
        { key: 'co2', label: 'CO2' },
        { key: 'ch4', label: 'CH4' },
      ],
    },
    {
      key: 'sector',
      label: 'Sector',
      categories: [
        { key: 'buildings', label: 'Buildings' },
        { key: 'transport', label: 'Transport' },
        { key: 'waste', label: 'Waste' },
        { key: 'agriculture', label: 'Agriculture' },
      ],
    },
    {
      key: 'scope',
      label: 'Scope',
      helpText: 'Where the emissions take place',
      categories: [
        { key: 'scope1', label: 'Scope 1', group: 'direct' },
        { key: 'scope2', label: 'Scope 2', group: 'direct' },
        { key: 'scope3', label: 'Scope 3', group: 'indirect' },
      ],
      groups: [
        { key: 'direct', label: 'Direct' },
        { key: 'indirect', label: 'Indirect' },
      ],
    },
  ],
  value: (cell, year) => {
    if (cell.sector === 'agriculture') return null;
    if (cell.gas === 'ch4') return 0;
    const base = CO2_BASE[cell.sector][cell.scope];
    if (base === null || base === 0) return base;
    return base + (year - 2020);
  },
  goals: [
    { categories: [], groups: [], values: EMISSIONS_GOAL_VALUES.all },
    { categories: [em.buildings], groups: [], values: EMISSIONS_GOAL_VALUES.buildings },
  ],
});

/** Instance goals, which refer to dimensions and categories by their original ids */
function makeGoal(id: string, dimensions: InstanceGoalInput['dimensions']): InstanceGoalInput {
  return { id, label: id, default: false, disabled: false, dimensions };
}

export const goals = {
  buildings: makeGoal('buildings', [
    { dimension: 'sector', categories: ['buildings'], groups: null },
  ]),
  indirect: makeGoal('indirect', [{ dimension: 'scope', categories: [], groups: ['indirect'] }]),
  buildingsIndirect: makeGoal('buildings-indirect', [
    { dimension: 'sector', categories: ['buildings'], groups: null },
    { dimension: 'scope', categories: [], groups: ['indirect'] },
  ]),
  /** Refers to a sector category the metric doesn't have */
  unknownSector: makeGoal('unknown-sector', [
    { dimension: 'sector', categories: ['fishing'], groups: null },
  ]),
  /** Refers to a dimension the metric doesn't have */
  otherDimension: makeGoal('other', [{ dimension: 'region', categories: ['north'], groups: null }]),
};

/*
 * SCENARIOS: the backend adds an outermost scenario dimension when the metric
 * is queried `withScenarios`.
 *
 *   default:            a [1, 2],   b [3, 4]
 *   progress_tracking:  a [10, 20], b [30, 40]
 */
export const SCENARIOS_ID = 'scen';
const SCENARIO_VALUES: Record<string, Record<string, number[]>> = {
  default: { a: [1, 2], b: [3, 4] },
  progress_tracking: { a: [10, 20], b: [30, 40] },
};

export const scenarios = buildMetric({
  id: SCENARIOS_ID,
  name: 'Scenario metric',
  years: [2020, 2021],
  forecastFrom: null,
  dimensions: [
    {
      key: 'scenario:ScenarioName',
      label: 'Scenario',
      categories: [
        { key: 'default', label: 'Default' },
        { key: 'progress_tracking', label: 'Progress tracking' },
      ],
    },
    {
      key: 'sector',
      label: 'Sector',
      categories: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    },
  ],
  value: (cell, year) => SCENARIO_VALUES[cell['scenario:ScenarioName']][cell.sector][year - 2020],
});

/*
 * SINKS: carbon sinks have negative values and no explicit order.
 *
 *   buildings [5, 6], transport [8, 9], sinks [-1, -2]
 */
export const SINKS_ID = 'sinks';
const SINK_VALUES: Record<string, number[]> = {
  buildings: [5, 6],
  transport: [8, 9],
  sinks: [-1, -2],
};
export const sinks = buildMetric({
  id: SINKS_ID,
  name: 'Net emissions',
  years: [2020, 2021],
  forecastFrom: null,
  dimensions: [
    {
      key: 'sector',
      label: 'Sector',
      categories: [
        { key: 'buildings', label: 'Buildings' },
        { key: 'sinks', label: 'Sinks' },
        { key: 'transport', label: 'Transport' },
      ],
    },
  ],
  value: (cell, year) => SINK_VALUES[cell.sector][year - 2020],
});

/*
 * ORDERED: categories with an explicit order come first, in that order.
 */
export const ORDERED_ID = 'ordered';
export const ordered = buildMetric({
  id: ORDERED_ID,
  name: 'Ordered metric',
  years: [2020],
  forecastFrom: null,
  dimensions: [
    {
      key: 'sector',
      label: 'Sector',
      categories: [
        { key: 'unordered', label: 'Unordered' },
        { key: 'second', label: 'Second', order: 2 },
        { key: 'first', label: 'First', order: 1 },
      ],
    },
  ],
  value: () => 1,
});

/*
 * PRECISE: values with more significant digits than a chart shows, which an
 * export must keep.
 */
export const PRECISE_ID = 'precise';
export const precise = buildMetric({
  id: PRECISE_ID,
  name: 'Precise metric',
  years: [2020],
  forecastFrom: null,
  dimensions: [{ key: 'sector', label: 'Sector', categories: [{ key: 'a', label: 'A' }] }],
  value: () => 1234.5678,
});

/*
 * SINGLE: one dimension with one category, so nothing is worth breaking down.
 */
export const SINGLE_ID = 'single';
export const single = buildMetric({
  id: SINGLE_ID,
  name: 'Single metric',
  years: [2020],
  forecastFrom: null,
  dimensions: [{ key: 'sector', label: 'Sector', categories: [{ key: 'a', label: 'A' }] }],
  value: () => 1,
});
