import dayjs from 'dayjs';
import type { Font, Style, Workbook } from 'exceljs';

import { flatten, sliceBy } from './slicing';
import { createCategoryTable, createTable } from './table';
import type { ExportOptions, MetricSliceData, ParsedMetric, SliceConfig, TableData } from './types';

type ExportLayout = NonNullable<ExportOptions['layout']>;

/**
 * Convert text to a filename-safe slug: lowercase ASCII letters and digits,
 * words joined with underscores. Accented letters lose their accents.
 */
function slugify(text: string): string {
  return text
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Create a filename for the export: the table title, or else the metric name
 * and the time.
 */
function createFilename(metricName: string, tableTitle?: string): string {
  if (tableTitle) return slugify(tableTitle);
  const ts = dayjs().format('YYYY-MM-DD_HHmm');
  return `${slugify(metricName) || 'data'}_${ts}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function tableCells(table: TableData) {
  return {
    header: table.header.map((hdr) => hdr.label),
    rows: table.rows.map((row) => table.header.map((hdr) => row[hdr.key] ?? null)),
  };
}

/**
 * Download data as CSV.
 */
function downloadCsv(filename: string, table: TableData): void {
  const delimiter = ';';
  const { header, rows } = tableCells(table);
  const lines = [header, ...rows].map((row) =>
    row
      .map((val) => {
        if (val === null) return '';
        if (typeof val === 'number') return val;
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(delimiter)
  );

  // BOM support for special characters in Excel
  const byteOrderMark = '﻿';
  const blob = new Blob([byteOrderMark, lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  downloadBlob(blob, `${filename}.csv`);
}

const FONT: Partial<Font> = { name: 'Calibri' };
const FORECAST_BORDER: Style['border'] = {
  left: { style: 'mediumDashed', color: { argb: '#000000' } },
};

/**
 * A row per category and a column per year, with a totals row. The first row
 * has the metric name and its unit; forecast years are in italics.
 */
function writeCategorySheet(wb: Workbook, metricName: string, unit: string, table: TableData) {
  const ws = wb.addWorksheet('Results');
  const { header, rows } = tableCells(table);

  const tb = ws.addTable({
    name: 'ResultsTable',
    ref: 'A2',
    headerRow: true,
    totalsRow: table.hasTotals,
    style: { showRowStripes: true, theme: 'TableStyleLight1' },
    columns: header.map((label, idx) => ({
      name: label.toString(),
      filterButton: idx === 0,
      totalsRowFunction: table.hasTotals && idx > 0 ? 'sum' : 'none',
    })),
    rows,
  });
  tb.commit();

  const firstRow = ws.getRow(1);
  if (header[0] !== metricName) {
    firstRow.getCell(1).value = metricName;
  }
  firstRow.getCell(2).value = unit;
  firstRow.font = { ...FONT };
  ws.getRow(2).font = { ...FONT, bold: true };
  ws.views.push({ state: 'frozen', ySplit: 2, xSplit: 1 });

  ws.getColumn(1).width = 32;
  const forecastFrom = table.forecastFromColumn;
  ws.columns.forEach((col, idx) => {
    const isForecast = forecastFrom !== null && idx >= forecastFrom;
    const style: Partial<Style> = { font: { ...FONT, italic: isForecast || undefined } };
    if (idx === forecastFrom) style.border = FORECAST_BORDER;
    col.style = style;
  });
}

/**
 * A row per year and a column per category, under a title row. Forecast
 * years are in italics.
 */
function writeYearSheet(wb: Workbook, title: string, table: TableData) {
  const ws = wb.addWorksheet('Results');
  const { header, rows } = tableCells(table);

  const tb = ws.addTable({
    name: 'ResultsTable',
    ref: 'A2',
    headerRow: true,
    style: { showRowStripes: true, theme: 'TableStyleLight1' },
    columns: header.map((label, idx) => ({ name: label.toString(), filterButton: idx === 0 })),
    rows,
  });
  tb.commit();

  const firstRow = ws.getRow(1);
  firstRow.getCell(1).value = title;
  firstRow.font = { ...FONT };
  ws.mergeCells(1, 1, 1, header.length);
  ws.getRow(2).font = { ...FONT, bold: true };
  ws.views.push({ state: 'frozen', ySplit: 2, xSplit: 1 });

  ws.columns.forEach((col) => {
    col.style = { font: { ...FONT } };
  });
  const forecastFrom = table.forecastFromRow;
  if (forecastFrom !== null) {
    // Data rows start after the title and header rows
    const firstForecastRow = 3 + forecastFrom;
    for (let rowNum = firstForecastRow; rowNum < 3 + rows.length; rowNum++) {
      const row = ws.getRow(rowNum);
      row.font = { ...FONT, italic: true };
      if (rowNum === firstForecastRow) {
        row.eachCell((cell) => {
          cell.border = { top: FORECAST_BORDER.left };
        });
      }
    }
  }
}

/**
 * Download data as Excel file.
 */
async function downloadXlsx(
  filename: string,
  metricName: string,
  slice: MetricSliceData,
  table: TableData,
  layout: ExportLayout,
  tableTitle?: string
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  if (layout === 'years') {
    writeYearSheet(wb, tableTitle ?? metricName, table);
  } else {
    writeCategorySheet(wb, metricName, slice.unit, table);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `${filename}.xlsx`);
}

/**
 * Download metric data as CSV or Excel file, with the values at full
 * precision. A grouped dimension is exported by its groups, as charts show it.
 *
 * @param metric - The parsed metric
 * @param config - Slice configuration
 * @param format - Export format ('xlsx' or 'csv')
 * @param options - Additional export options
 */
export async function downloadData(
  metric: ParsedMetric,
  config: SliceConfig,
  format: 'xlsx' | 'csv',
  options?: ExportOptions
): Promise<void> {
  const { years, tableTitle, labels, filterZero = true, layout = 'categories' } = options ?? {};

  let slice: MetricSliceData | null;
  if (config.dimensionId) {
    slice = sliceBy(metric, config.dimensionId, false, config.categories, true, {
      years,
      filterZero,
    });
  } else {
    slice = flatten(metric, config.categories, years);
  }

  if (!slice) return;

  const filename = createFilename(metric.name, tableTitle);
  const table = layout === 'years' ? createTable(slice, years, labels) : createCategoryTable(slice);

  if (format === 'csv') {
    downloadCsv(filename, table);
  } else {
    await downloadXlsx(filename, metric.name, slice, table, layout, tableTitle);
  }
}
