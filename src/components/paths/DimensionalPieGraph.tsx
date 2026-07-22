import { useEffect, useMemo, useState } from 'react';

import styled from '@emotion/styled';

import { useReactiveVar } from '@apollo/client/react';
import type { DimensionalNodeMetricFragment } from '@generated/paths/graphql';
import chroma from 'chroma-js';
import type { EChartsCoreOption } from 'echarts/core';
import { isEqual } from 'lodash-es';
import { useLocale } from 'next-intl';

import { activeGoalVar } from '@common/apollo/paths-cache';
import { Chart } from '@common/components/Chart';
import type { TFunction } from '@common/i18n';
import { useTheme } from '@common/themes';
import { formatWithFormatter, makeFormatter, sanitizeHtmlUnit } from '@common/utils/format';
import {
  type SliceConfig,
  getDefaultSliceConfig,
  getSingleYear,
  isForecastYear,
  overrideUnit,
  parseMetric,
} from '@common/utils/paths/metric';

const PlotsContainer = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
`;

const Subplot = styled.div`
  width: 300px;
  font-size: ${({ theme }) => theme.fontSizeSm};
  color: ${({ theme }) => theme.textColor.tertiary};
`;

// Outer radius (percent of half the chart's smaller dimension) of the pie
// with the largest total; the others scale so that pie AREA is proportional
// to the total (radius ∝ √ratio) — perceptually honest, unlike the old
// Plotly domain math that saturated at full size for ratios above ~0.53.
const MAX_OUTER_RADIUS = 65;
// Donut hole, as a fraction of the outer radius
const HOLE_RATIO = 0.5;

type MetricDim = NonNullable<DimensionalNodeMetricFragment['metricDim']>;

type InstanceContext = {
  features?: {
    maximumFractionDigits?: number | null;
    showSignificantDigits?: number | null;
  } | null;
};

type DimensionalPieGraphProps = {
  metric: MetricDim;
  endYear: number;
  colorChange?: number;
  instance: InstanceContext;
  t: TFunction;
};

type PieSlice = {
  /** Legend/series name: category label with its percentage share appended */
  name: string;
  value: number;
  color: string;
  /** Preformatted tooltip HTML: label, value and unit */
  hover: string;
};

type Pie = {
  key: string;
  name: string;
  total: number;
  option: EChartsCoreOption;
};

const DimensionalPieGraph = ({
  metric,
  endYear,
  colorChange: colorChangeProp = 0,
  instance,
  t,
}: DimensionalPieGraphProps) => {
  const locale = useLocale();
  const formatNumber = useMemo(() => {
    const formatter = makeFormatter(
      locale,
      instance.features?.showSignificantDigits ?? undefined,
      instance.features?.maximumFractionDigits ?? undefined
    );
    return (value: number) => formatWithFormatter(formatter, value);
  }, [locale, instance.features?.showSignificantDigits, instance.features?.maximumFractionDigits]);
  const theme = useTheme();
  const activeGoal = useReactiveVar(activeGoalVar);
  const parsedMetric = useMemo(() => parseMetric(metric), [metric]);
  const isForecast = isForecastYear(parsedMetric, endYear);
  const defaultConfig = getDefaultSliceConfig(parsedMetric, activeGoal);
  const [sliceConfig, setSliceConfig] = useState<SliceConfig>(defaultConfig);

  // TODO: Handle this color change more elegantly.
  // Currently isForecast and set colorChange will not be true at the same time
  const colorChange = isForecast ? 1 : colorChangeProp;

  useEffect(() => {
    /**
     * If the active goal changes, we will reset the grouping + filtering
     * to be compatible with the new choices (if the new goal has common
     * dimensions with our metric).
     */
    if (!activeGoal) return;
    const newDefault = getDefaultSliceConfig(parsedMetric, activeGoal);
    if (!newDefault || isEqual(sliceConfig, newDefault)) return;
    setSliceConfig(newDefault);
  }, [activeGoal, parsedMetric]);

  const yearData = useMemo(
    () => getSingleYear(parsedMetric, endYear, sliceConfig.categories),
    [parsedMetric, endYear, sliceConfig]
  );

  const longUnit = overrideUnit(parsedMetric, metric.unit, t);

  const pies: Pie[] = useMemo(() => {
    const unit = sanitizeHtmlUnit(metric.unit.htmlShort);

    // One pie per column category (e.g. per emission scope)
    const rawPies = yearData.categoryTypes[1].options.map((colId, cIdx) => {
      // Pie slice per row category
      const slices: Omit<PieSlice, 'name'>[] = [];
      const labels: string[] = [];
      yearData.categoryTypes[0].options.forEach((rowId, rIdx) => {
        const datum = yearData.rows[rIdx][cIdx];
        if (datum == null || datum === 0) return;
        const dimDetails = yearData.allLabels.find((l) => l.id === rowId);
        const label = dimDetails?.label ?? '';
        const value = Math.abs(datum);
        labels.push(label);
        slices.push({
          value,
          color: chroma(dimDetails?.color || '#333')
            .brighten(colorChange)
            .hex(),
          hover: `${label}, <b>${formatNumber(value)}</b> ${unit}`,
        });
      });

      const total = slices.reduce((sum, slice) => sum + slice.value, 0);
      const namedSlices: PieSlice[] = slices.map((slice, idx) => ({
        ...slice,
        name: `${labels[idx]}, ${formatNumber((slice.value / total) * 100)}%`,
      }));
      // Largest slice first, like Plotly's default `sort: true`; combined with
      // the counterclockwise layout below this also orders the legend by size.
      namedSlices.sort((a, b) => b.value - a.value);

      return {
        key: colId,
        name: yearData.allLabels.find((l) => l.id === colId)?.label || '',
        total,
        slices: namedSlices,
      };
    });

    const maxTotal = rawPies.reduce((max, pie) => Math.max(max, pie.total), 0);

    return rawPies.map((pie) => {
      const outerRadius = MAX_OUTER_RADIUS * (maxTotal > 0 ? Math.sqrt(pie.total / maxTotal) : 1);
      const hovers = pie.slices.map((slice) => slice.hover);
      const option: EChartsCoreOption = {
        tooltip: {
          trigger: 'item',
          formatter: (params: { dataIndex: number }) => hovers[params.dataIndex],
        },
        legend: {
          bottom: 0,
          selectedMode: false,
        },
        // Total in the middle of the donut
        title: {
          text: formatNumber(pie.total),
          left: 'center',
          top: 'middle',
          textStyle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: theme.graphColors.grey050,
          },
        },
        series: [
          {
            type: 'pie',
            radius: [`${outerRadius * HOLE_RATIO}%`, `${outerRadius}%`],
            center: ['50%', '50%'],
            // Draw counterclockwise starting from 6 o'clock, matching the old
            // Plotly rendering
            startAngle: 270,
            clockwise: false,
            label: { show: false },
            data: pie.slices.map((slice) => ({
              name: slice.name,
              value: slice.value,
              itemStyle: { color: slice.color },
            })),
          },
        ],
      };
      return { key: pie.key, name: pie.name, total: pie.total, option };
    });
  }, [yearData, metric.unit.htmlShort, colorChange, formatNumber, theme.graphColors.grey050]);

  return (
    <PlotsContainer className="mt-3">
      {pies.map(
        (pie) =>
          pie.total !== 0 && (
            <Subplot key={pie.key}>
              <h5>
                {pie.name} {endYear}
              </h5>
              <span dangerouslySetInnerHTML={{ __html: longUnit }} />
              <Chart
                isLoading={false}
                data={pie.option}
                height="380px"
                withResizeLegend={false}
                locale={locale}
              />
            </Subplot>
          )
      )}
    </PlotsContainer>
  );
};

export default DimensionalPieGraph;
