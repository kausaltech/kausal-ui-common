// Types - Input types (contract for GraphQL data)
export type {
  MetricInput,
  MetricDimensionInput,
  MetricDimensionCategoryInput,
  MetricCategoryGroupInput,
  MetricGoalInput,
  MetricUnitInput,
  MetricNormalizedByInput,
  InstanceGoalInput,
  NodeMetricValueInput,
  NodeMetricInput,
} from './types';

// Types - Processed/internal types
export type {
  MetricDimension,
  MetricDimensionCategory,
  MetricCategoryGroup,
  MetricRow,
  DimCats,
  ParsedMetric,
  CatDimChoice,
  MetricCategoryChoice,
  SliceConfig,
  MetricCategory,
  MetricCategoryValues,
  MetricSliceData,
  SingleYearData,
  TableData,
  TableLabels,
  ExportOptions,
  DimensionOption,
} from './types';

// Parse
export { parseMetric, filterScenario, ALL_SCENARIOS } from './parse';

// Accessors
export {
  getName,
  getUnit,
  getUnitShort,
  overrideUnit,
  type CO2eUnitKey,
  getForecastFrom,
  getHistoricalYears,
  getForecastYears,
  isForecastYear,
  getMetricValue,
  getMetricChange,
  getOutcomeTotal,
} from './accessors';

// Dimensions
export {
  hasDimension,
  getDimensionLabel,
  getCategoryLabel,
  getGroupLabel,
  getSelectableDimensions,
  getOptionsForDimension,
  getSliceableDims,
} from './dimensions';

// Goals
export { getGoalsForChoice, getChoicesForGoal } from './goals';

// Config
export { getDefaultSliceConfig, updateChoice } from './config';

// Slicing
export { sliceBy, flatten, getSingleYear, type SliceOptions } from './slicing';

// Export
export { downloadData } from './export';

// Table utilities
export { createTable, createCategoryTable, type MetricSlice } from './table';

// Chart utilities
export { getFilteredYears } from './chart';
