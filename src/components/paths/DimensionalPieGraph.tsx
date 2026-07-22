import { useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import styled from '@emotion/styled';

import { useReactiveVar } from '@apollo/client/react';
import type { DimensionalNodeMetricFragment } from '@generated/paths/graphql';
import chroma from 'chroma-js';
import { isEqual } from 'lodash-es';
import { useLocale } from 'next-intl';

import { activeGoalVar } from '@common/apollo/paths-cache';
import type { TFunction } from '@common/i18n';
import { useTheme } from '@common/themes';
import { formatWithFormatter, makeFormatter } from '@common/utils/format';
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
  font-size: ${({ theme }) => theme.fontSizeSm};
  color: ${({ theme }) => theme.textColor.tertiary};
`;

const Plot = dynamic(() => import('@/components/graphs/Plot'), { ssr: false });

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

  const yearData = getSingleYear(parsedMetric, endYear, sliceConfig.categories);

  const longUnit = overrideUnit(parsedMetric, metric.unit, t);

  const plotData: {
    data: Partial<Plotly.PlotData>;
    layout: Partial<Plotly.Layout>;
    total: 0 | number;
  }[] = [];
  const defaultLayout: Partial<Plotly.Layout> = {
    width: 300,
    modebar: {
      remove: [
        'zoom2d',
        'zoomIn2d',
        'zoomOut2d',
        'pan2d',
        'select2d',
        'lasso2d',
        'autoScale2d',
        'resetScale2d',
      ],
      color: theme.graphColors.grey090,
      bgcolor: theme.graphColors.grey010,
      activecolor: theme.brandDark,
    },
    dragmode: false,
    showlegend: true,
    legend: {
      x: 0.5,
      y: -0.1,
      xanchor: 'center',
      yanchor: 'top',
      orientation: 'h',
      itemclick: false,
      itemdoubleclick: false,
    },
    margin: {
      l: 50,
      r: 50,
      b: 50,
      t: 50,
      pad: 4,
    },
    autosize: false,
  };

  let maxTotal = 0;

  // Pie per scope
  yearData.categoryTypes[1].options.forEach((colId, cIdx) => {
    const colTotals = yearData.rows.reduce((acc, row) => {
      return row[cIdx] ? row[cIdx] + acc : acc;
    }, 0);
    // Remember the largest total for scaling the pies
    if (Math.abs(colTotals) > maxTotal) {
      maxTotal = Math.abs(colTotals);
    }
    // Pie segment per sector
    const pieSegmentLabels: string[] = [];
    const pieSegmentValues: (number | null)[] = [];
    const pieSegmentColors: string[] = [];
    const pieSegmentHovers: string[] = [];
    yearData.categoryTypes[0].options.forEach((rowId, rIdx) => {
      const datum = yearData.rows[rIdx][cIdx];
      if (datum != 0) {
        pieSegmentLabels.push(`${yearData.allLabels.find((l) => l.id === rowId)?.label}` || '');
        pieSegmentValues.push(datum ? Math.abs(datum) : null);
        const segmentColor = yearData.allLabels.find((l) => l.id === rowId)?.color || '#333';
        pieSegmentColors.push(chroma(segmentColor).brighten(colorChange).hex());
        pieSegmentHovers.push(
          `${yearData.allLabels.find((l) => l.id === rowId)?.label}, ${
            datum && formatNumber(Math.abs(datum))
          } ${datum && metric.unit.htmlShort}` || ''
        );
      }
    });

    // Calculate total and percentages
    const total =
      pieSegmentValues.reduce((sum, value) => {
        const numSum = sum === null ? 0 : sum;
        const numValue = value === null ? 0 : value;
        return numSum + numValue;
      }, 0) || 0;
    const percentages = pieSegmentValues.map((value) =>
      value != null ? formatNumber((value / total) * 100) : null
    );

    // Create new labels with percentages
    const newLabels = pieSegmentLabels.map((label, index) => `${label}, ${percentages[index]}%`);

    plotData.push({
      total: total,
      layout: {
        ...defaultLayout,
        annotations: [
          {
            font: {
              size: 18,
              color: theme.graphColors.grey050,
            },
            showarrow: false,
            text: `<b>${formatNumber(total)}</b>`,
            x: 0.5,
            y: 0.5,
          },
        ],
      },
      data: {
        type: 'pie',
        hole: 0.5,
        labels: newLabels,
        values: pieSegmentValues,
        hovertext: pieSegmentHovers,
        textinfo: 'none',
        hoverinfo: 'text',
        marker: {
          colors: pieSegmentColors,
        },
        name: yearData.allLabels.find((l) => l.id === colId)?.label || '',
      },
    });
  });

  plotData.forEach((plot) => {
    const scaleTotal = plot.total / maxTotal;
    const scalePie = 0.95 * scaleTotal; // Use this to scale multiple pies relative to each other
    plot.data.domain = {
      x: [0.5 - scalePie, 0.5 + scalePie],
      y: [0.5 - scalePie, 0.5 + scalePie],
    };
  });

  const plotConfig = {
    displaylogo: false,
    responsive: true,
  };

  return (
    <>
      <PlotsContainer className="mt-3">
        {plotData.map(
          (plot) =>
            plot.total !== 0 && (
              <Subplot key={plot.data.name}>
                <h5>
                  {plot.data.name} {endYear}
                </h5>
                <span dangerouslySetInnerHTML={{ __html: longUnit }} />
                <Plot
                  data={[plot.data]}
                  layout={plot.layout}
                  useResizeHandler
                  config={plotConfig}
                  style={{ minWidth: '300px', maxWidth: '600px' }}
                  noValidate
                />
              </Subplot>
            )
        )}
      </PlotsContainer>
    </>
  );
};

export default DimensionalPieGraph;
