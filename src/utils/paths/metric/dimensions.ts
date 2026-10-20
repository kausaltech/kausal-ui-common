import { rowMatchesChoice } from './slicing';
import type { DimensionOption, MetricCategoryChoice, MetricDimension, ParsedMetric } from './types';

/**
 * Checks if the metric has a matching dimension.
 *
 * @param metric - The parsed metric
 * @param originalDimId - The non-prefixed (canonical) id for the dimension
 */
export function hasDimension(metric: ParsedMetric, originalDimId: string): boolean {
  return metric.dimensions.some((dim) => dim.originalId === originalDimId);
}

/** The label of a dimension, or undefined if there is no such dimension. */
export function getDimensionLabel(
  metric: ParsedMetric,
  dimId: string | undefined
): string | undefined {
  if (!dimId) return undefined;
  return metric.dimsById.get(dimId)?.label;
}

/** The label of a category of any dimension, or undefined if there is none. */
export function getCategoryLabel(
  metric: ParsedMetric,
  catId: string | undefined
): string | undefined {
  if (!catId) return undefined;
  for (const dim of metric.dimensions) {
    const cat = dim.categories.find((c) => c.id === catId);
    if (cat) return cat.label;
  }
  return undefined;
}

/** The label of a category group of a dimension, or undefined if there is none. */
export function getGroupLabel(
  metric: ParsedMetric,
  dimId: string,
  groupId: string
): string | undefined {
  return metric.dimsById.get(dimId)?.groupsById.get(groupId)?.label;
}

/**
 * The ids of the categories and groups of a dimension that would have
 * (non-null, non-zero) data with the filters of the *other* dimensions applied.
 */
function getCatsWithData(
  metric: ParsedMetric,
  dimId: string,
  config: MetricCategoryChoice
): Set<string> {
  const otherFilters = { ...config, [dimId]: undefined };
  const ids = new Set<string>();
  metric.rows.forEach((row) => {
    if (row.value === null || row.value === 0) return;
    if (!rowMatchesChoice(row, otherFilters)) return;
    const cat = row.dimCats[dimId];
    ids.add(cat.id);
    if (cat.group) ids.add(cat.group);
  });
  return ids;
}

const selectableDimensions = new WeakMap<ParsedMetric, readonly MetricDimension[]>();

/**
 * Dimensions worth offering as breakdown and filter controls: those with at
 * least two categories (or groups, for grouped dimensions) that have data.
 * Breaking down or filtering by any other dimension wouldn't change the chart.
 */
export function getSelectableDimensions(metric: ParsedMetric): readonly MetricDimension[] {
  let dims = selectableDimensions.get(metric);
  if (!dims) {
    dims = metric.dimensions.filter((dim) => {
      const withData = getCatsWithData(metric, dim.id, {});
      const options = dim.groups.length ? dim.groups : dim.categories;
      return options.filter((opt) => withData.has(opt.id)).length >= 2;
    });
    selectableDimensions.set(metric, dims);
  }
  return dims;
}

/**
 * Get options (categories or groups) for a dimension based on current config.
 *
 * @param metric - The parsed metric
 * @param dimId - The dimension ID
 * @param config - Current category choice configuration
 * @returns Options with their selection state, and whether they have data
 *   with the filters of the other dimensions applied
 */
export function getOptionsForDimension(
  metric: ParsedMetric,
  dimId: string,
  config: MetricCategoryChoice
): readonly DimensionOption[] {
  const dim = metric.dimsById.get(dimId);
  if (!dim) return [];

  const choice = config[dimId];
  const withData = getCatsWithData(metric, dimId, config);

  if (dim.groups.length) {
    const selected = choice?.groups ?? [];
    return dim.groups.map((grp) => ({
      id: grp.id,
      label: grp.label,
      selected: selected.includes(grp.id),
      hasData: withData.has(grp.id),
    }));
  }

  const selected = choice?.categories ?? [];
  return dim.categories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    selected: selected.includes(cat.id),
    hasData: withData.has(cat.id),
  }));
}
