import type { MetricSliceData, TableData, TableLabels } from './types';

// Re-export the type for convenience
export type MetricSlice = MetricSliceData;

/** Remove floating point noise from a sum, e.g. 0.1 + 0.2 */
const cleanSum = (value: number) => parseFloat(value.toPrecision(12));

/**
 * Create a table of the slice data with a row per category and a column per
 * year, as the node visualisation exports it.
 *
 * @param slice - The slice data
 * @returns Table data structure
 */
export function createCategoryTable(slice: MetricSliceData): TableData {
  const header = [
    { key: 'category', label: slice.dimensionLabel },
    ...[...slice.historicalYears, ...slice.forecastYears].map((year) => ({
      key: year.toString(),
      label: year.toString(),
    })),
  ];
  const rows = slice.categoryValues.map((cv) => ({
    category: cv.category.label,
    ...Object.fromEntries(
      slice.historicalYears.map((year, idx) => [year.toString(), cv.historicalValues[idx]])
    ),
    ...Object.fromEntries(
      slice.forecastYears.map((year, idx) => [year.toString(), cv.forecastValues[idx]])
    ),
  }));

  return {
    header,
    rows,
    hasTotals: slice.totalValues !== null,
    forecastFromColumn: slice.forecastYears.length ? 1 + slice.historicalYears.length : null,
    forecastFromRow: null,
  };
}

/**
 * Create a table of the slice data with a row per year and a column per
 * category, with a total column.
 *
 * @param slice - The slice data
 * @param years - Specific years to include (defaults to all)
 * @param labels - Custom labels for table headers
 * @returns Table data structure
 */
export function createTable(
  slice: MetricSliceData,
  years?: readonly number[],
  labels?: TableLabels
): TableData {
  const viewTotalLabel = labels?.total ?? 'Total';
  const viewTypeLabel = labels?.type ?? 'Type';
  const viewYearLabel = labels?.year ?? 'Year';
  const viewUnitLabel = labels?.unit ?? 'Unit';
  const viewHistoricalLabel = labels?.historical ?? 'Historical';
  const viewForecastLabel = labels?.forecast ?? 'Forecast';
  const NO_VALUE = '';

  const header = [
    { key: 'year', label: viewYearLabel },
    { key: 'type', label: viewTypeLabel },
    { key: 'unit', label: viewUnitLabel },
    ...slice.categoryValues.map((cv) => ({
      key: cv.category.id,
      label: cv.category.label,
    })),
    { key: 'total', label: viewTotalLabel },
  ];

  const useYears = years ?? [...slice.historicalYears, ...slice.forecastYears];

  const rows = useYears.map((year) => {
    const row: { [key: string]: string | number | null } = {
      year: year.toString(),
      unit: slice.unit,
    };

    const historicalYearIndex = slice.historicalYears.indexOf(year);
    const forecastYearIndex = slice.forecastYears.indexOf(year);
    let total = 0;

    slice.categoryValues.forEach((cv) => {
      const value =
        historicalYearIndex >= 0
          ? (cv.historicalValues[historicalYearIndex] ?? null)
          : forecastYearIndex >= 0
            ? (cv.forecastValues[forecastYearIndex] ?? null)
            : null;
      row[cv.category.id] = value ?? NO_VALUE;
      total += value ?? 0;
    });

    row.total = cleanSum(total);
    row.type = historicalYearIndex >= 0 ? viewHistoricalLabel : viewForecastLabel;
    return row;
  });

  const forecastFromRow = useYears.findIndex((year) => slice.forecastYears.includes(year));

  return {
    header,
    rows,
    hasTotals: slice.totalValues !== null,
    forecastFromColumn: null,
    forecastFromRow: forecastFromRow >= 0 ? forecastFromRow : null,
  };
}
