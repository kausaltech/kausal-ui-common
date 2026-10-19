import { getSelectableDimensions } from './dimensions';
import { getChoicesForGoal } from './goals';
import type {
  CatDimChoice,
  InstanceGoalInput,
  MetricCategoryChoice,
  MetricDimension,
  ParsedMetric,
  SliceConfig,
} from './types';

/**
 * Convert a choice selection to category filters.
 */
function choiceToCats(
  dim: MetricDimension,
  old: MetricCategoryChoice,
  newChoice: readonly { id: string }[]
): MetricCategoryChoice {
  const out: { [dimId: string]: CatDimChoice | undefined } = {
    ...old,
    [dim.id]: undefined,
  };

  if (!newChoice.length) return out;

  const ids = newChoice.map((ch) => ch.id);
  let val: CatDimChoice;

  if (dim.groups.length) {
    const groups = ids.map((id) => dim.groupsById.get(id)!);
    const cats = groups.flatMap((grp) => grp.categories);
    val = {
      groups: groups.map((grp) => grp.id),
      categories: cats.map((cat) => cat.id),
    };
  } else {
    val = {
      groups: null,
      categories: ids,
    };
  }

  out[dim.id] = val;
  return out;
}

/**
 * Update the category filter of a dimension. The dimension to slice by is
 * the user's choice and is kept as is, even if it's the one being filtered.
 *
 * @param metric - The parsed metric
 * @param dim - The dimension being updated
 * @param oldConfig - Current slice configuration
 * @param newChoice - New selection for the dimension; empty clears its filter
 * @returns Updated slice configuration
 */
export function updateChoice(
  _metric: ParsedMetric,
  dim: MetricDimension,
  oldConfig: SliceConfig,
  newChoice: readonly { id: string }[]
): SliceConfig {
  return {
    ...oldConfig,
    categories: choiceToCats(dim, oldConfig.categories, newChoice),
  };
}

/**
 * Get the default slice configuration, optionally based on an active goal.
 *
 * By default, we break down by the first dimension that splits the data into
 * several series (see `getSelectableDimensions`), or else the first one.
 * If the currently selected goal has category selections for this metric,
 * those become the filters and we might break down by another dimension.
 *
 * NOTE: This is just the default -- the actually active filtering and
 * grouping is controlled by the component's slice config state.
 *
 * @param metric - The parsed metric
 * @param activeGoal - The currently selected goal, if any
 * @returns Default slice configuration
 */
export function getDefaultSliceConfig(
  metric: ParsedMetric,
  activeGoal: InstanceGoalInput | null
): SliceConfig {
  const selectableDims = getSelectableDimensions(metric);
  const defaultConfig: SliceConfig = {
    dimensionId: (selectableDims[0] ?? metric.dimensions[0])?.id,
    categories: {},
  };

  if (!activeGoal) return defaultConfig;

  const cubeDefault = getChoicesForGoal(metric, activeGoal);
  if (!cubeDefault) return defaultConfig;

  const configWithGoal: SliceConfig = { ...defaultConfig, categories: cubeDefault };

  // If the goal filters the default breakdown dimension, break down by
  // another one. If it filters every selectable dimension, slicing by a
  // filtered one is still allowed.
  if (configWithGoal.dimensionId && Object.hasOwn(cubeDefault, configWithGoal.dimensionId)) {
    const firstPossible = selectableDims.find((dim) => !Object.hasOwn(cubeDefault, dim.id));
    if (firstPossible) return { ...configWithGoal, dimensionId: firstPossible.id };
  }

  return configWithGoal;
}
