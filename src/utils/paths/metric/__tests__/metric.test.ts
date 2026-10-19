import {
  ALL_SCENARIOS,
  type MetricSliceData,
  type SliceConfig,
  downloadData,
  flatten,
  getCategoryLabel,
  getChoicesForGoal,
  getDefaultSliceConfig,
  getDimensionLabel,
  getGoalsForChoice,
  getGroupLabel,
  getOptionsForDimension,
  getSelectableDimensions,
  getSingleYear,
  hasDimension,
  parseMetric,
  sliceBy,
  updateChoice,
} from '@common/utils/paths/metric';

import {
  EMISSIONS_GOAL_VALUES,
  buildMetric,
  catId,
  dimId,
  em,
  emissions,
  goals,
  ordered,
  precise,
  scenarios,
  single,
  sinks,
} from './fixtures';

/*
 * The behaviour of the shared metric data layer, which the node visualisation
 * of both apps (watch-ui and paths-ui) builds on. The expectations follow
 * paths-ui's `DimensionalMetric` class, which the shared layer replaces.
 *
 * Tests tagged [common] pin improvements of the shared layer over the class.
 */

const metric = parseMetric(emissions);

const summary = (slice: MetricSliceData | null) =>
  slice?.categoryValues.map((cv) => ({
    id: cv.category.id,
    historical: [...cv.historicalValues],
    forecast: [...cv.forecastValues],
  }));

const dim = (id: string) => metric.dimensions.find((d) => d.id === id)!;

describe('parseMetric', () => {
  it('resolves the categories of each group', () => {
    const scope = dim(em.scope);
    expect(scope.groups.map((grp) => grp.id)).toEqual([em.direct, em.indirect]);
    expect(scope.groupsById.get(em.direct)?.categories.map((cat) => cat.id)).toEqual([
      em.scope1,
      em.scope2,
    ]);
  });

  it('keeps only the default scenario and drops the scenario dimension', () => {
    const parsed = parseMetric(scenarios);
    expect(parsed.dimensions.map((d) => d.originalId)).toEqual(['sector']);
    expect(summary(flatten(parsed, undefined))).toEqual([
      { id: 'scen', historical: [4, 6], forecast: [] },
    ]);
  });

  it('keeps the given scenario', () => {
    const parsed = parseMetric(scenarios, 'progress_tracking');
    expect(summary(flatten(parsed, undefined))?.[0].historical).toEqual([40, 60]);
  });

  it('falls back to the first scenario when the given one is missing', () => {
    const parsed = parseMetric(scenarios, 'no_such_scenario');
    expect(summary(flatten(parsed, undefined))?.[0].historical).toEqual([4, 6]);
  });

  it('keeps every scenario with ALL_SCENARIOS', () => {
    const parsed = parseMetric(scenarios, ALL_SCENARIOS);
    expect(parsed.dimensions).toHaveLength(2);
    expect(summary(flatten(parsed, undefined))?.[0].historical).toEqual([44, 66]);
  });

  it('leaves a metric without a scenario dimension as it is', () => {
    expect(metric.dimensions.map((d) => d.id)).toEqual([em.gas, em.sector, em.scope]);
    expect(metric.rows).toHaveLength(2 * 4 * 3 * 4);
  });
});

describe('labels', () => {
  it('finds dimension, category and group labels', () => {
    expect(getDimensionLabel(metric, em.sector)).toBe('Sector');
    expect(getCategoryLabel(metric, em.transport)).toBe('Transport');
    expect(getGroupLabel(metric, em.scope, em.indirect)).toBe('Indirect');
  });

  it('returns undefined for missing or unknown ids', () => {
    expect(getDimensionLabel(metric, undefined)).toBeUndefined();
    expect(getDimensionLabel(metric, 'nope')).toBeUndefined();
    expect(getCategoryLabel(metric, undefined)).toBeUndefined();
    expect(getCategoryLabel(metric, 'nope')).toBeUndefined();
    expect(getGroupLabel(metric, em.scope, 'nope')).toBeUndefined();
  });
});

describe('hasDimension', () => {
  it('matches the original dimension id', () => {
    expect(hasDimension(metric, 'sector')).toBe(true);
    expect(hasDimension(metric, em.sector)).toBe(false);
  });
});

describe('getSelectableDimensions', () => {
  it('offers dimensions with at least two categories or groups that have data', () => {
    // Only CO2 of the gases has non-zero data
    expect(getSelectableDimensions(metric).map((d) => d.id)).toEqual([em.sector, em.scope]);
  });

  it('offers nothing when no dimension splits the data', () => {
    expect(getSelectableDimensions(parseMetric(single))).toEqual([]);
  });
});

describe('getOptionsForDimension', () => {
  it('lists the categories, with whether they have non-zero data', () => {
    expect(getOptionsForDimension(metric, em.sector, {})).toEqual([
      { id: em.buildings, label: 'Buildings', selected: false, hasData: true },
      { id: em.transport, label: 'Transport', selected: false, hasData: true },
      { id: em.waste, label: 'Waste', selected: false, hasData: false },
      { id: em.agriculture, label: 'Agriculture', selected: false, hasData: false },
    ]);
  });

  it('lists the groups of a grouped dimension', () => {
    expect(getOptionsForDimension(metric, em.scope, {})).toEqual([
      { id: em.direct, label: 'Direct', selected: false, hasData: true },
      { id: em.indirect, label: 'Indirect', selected: false, hasData: true },
    ]);
  });

  it('checks for data with the filters of the other dimensions applied', () => {
    const indirect = { [em.scope]: { groups: [em.indirect], categories: [em.scope3] } };
    const options = getOptionsForDimension(metric, em.sector, indirect);
    // Transport has no scope 3 data
    expect(options.filter((opt) => opt.hasData).map((opt) => opt.id)).toEqual([em.buildings]);

    const transport = { [em.sector]: { groups: null, categories: [em.transport] } };
    expect(getOptionsForDimension(metric, em.scope, transport)).toEqual([
      { id: em.direct, label: 'Direct', selected: false, hasData: true },
      { id: em.indirect, label: 'Indirect', selected: false, hasData: false },
    ]);
  });

  it("marks the selected options and ignores the dimension's own filter for data", () => {
    const buildings = { [em.sector]: { groups: null, categories: [em.buildings] } };
    const options = getOptionsForDimension(metric, em.sector, buildings);
    expect(options.filter((opt) => opt.selected).map((opt) => opt.id)).toEqual([em.buildings]);
    expect(options.find((opt) => opt.id === em.transport)?.hasData).toBe(true);

    const indirect = { [em.scope]: { groups: [em.indirect], categories: [em.scope3] } };
    expect(
      getOptionsForDimension(metric, em.scope, indirect)
        .filter((opt) => opt.selected)
        .map((opt) => opt.id)
    ).toEqual([em.indirect]);
  });
});

describe('updateChoice', () => {
  const base: SliceConfig = { dimensionId: em.scope, categories: {} };

  it('filters a grouped dimension by the groups and their categories', () => {
    const updated = updateChoice(metric, dim(em.scope), base, [{ id: em.direct }]);
    expect(updated.categories[em.scope]).toEqual({
      groups: [em.direct],
      categories: [em.scope1, em.scope2],
    });
  });

  it('filters a dimension by its categories', () => {
    const updated = updateChoice(metric, dim(em.sector), base, [
      { id: em.buildings },
      { id: em.transport },
    ]);
    expect(updated.categories[em.sector]).toEqual({
      groups: null,
      categories: [em.buildings, em.transport],
    });
  });

  it('keeps the breakdown dimension, also when it is the one filtered', () => {
    const updated = updateChoice(metric, dim(em.scope), base, [{ id: em.indirect }]);
    expect(updated.dimensionId).toBe(em.scope);
  });

  it('clears the filter of a dimension with an empty selection', () => {
    const filtered = updateChoice(metric, dim(em.sector), base, [{ id: em.buildings }]);
    const cleared = updateChoice(metric, dim(em.sector), filtered, []);
    expect(cleared.categories[em.sector]).toBeUndefined();
    expect(cleared.dimensionId).toBe(em.scope);
  });
});

describe('getChoicesForGoal', () => {
  it('maps goal categories by their original ids', () => {
    expect(getChoicesForGoal(metric, goals.buildings)).toEqual({
      [em.sector]: { groups: null, categories: [em.buildings] },
    });
  });

  it('maps goal groups to the groups and their categories', () => {
    expect(getChoicesForGoal(metric, goals.indirect)).toEqual({
      [em.scope]: { groups: [em.indirect], categories: [em.scope3] },
    });
  });

  it('skips a dimension whose goal categories match none of the metric', () => {
    expect(getChoicesForGoal(metric, goals.unknownSector)).toEqual({});
  });

  it('returns null when the goal has none of the metric dimensions', () => {
    expect(getChoicesForGoal(metric, goals.otherDimension)).toBeNull();
  });
});

describe('getDefaultSliceConfig', () => {
  it('breaks down by the first dimension that splits the data', () => {
    // Not by `gas`, the first dimension, whose only data is CO2
    expect(getDefaultSliceConfig(metric, null)).toEqual({
      dimensionId: em.sector,
      categories: {},
    });
  });

  it('falls back to the first dimension when none splits the data', () => {
    expect(getDefaultSliceConfig(parseMetric(single), null).dimensionId).toBe(
      dimId('single', 'sector')
    );
  });

  it("filters by the goal's choices and breaks down by another dimension", () => {
    expect(getDefaultSliceConfig(metric, goals.buildings)).toEqual({
      dimensionId: em.scope,
      categories: { [em.sector]: { groups: null, categories: [em.buildings] } },
    });
  });

  it('keeps the default breakdown when the goal filters every selectable dimension', () => {
    const config = getDefaultSliceConfig(metric, goals.buildingsIndirect);
    expect(config.dimensionId).toBe(em.sector);
    expect(Object.keys(config.categories).sort()).toEqual([em.scope, em.sector].sort());
  });

  it('ignores a goal that matches no categories', () => {
    expect(getDefaultSliceConfig(metric, goals.unknownSector)).toEqual({
      dimensionId: em.sector,
      categories: {},
    });
  });

  it('ignores a goal without the metric dimensions', () => {
    expect(getDefaultSliceConfig(metric, goals.otherDimension)).toEqual({
      dimensionId: em.sector,
      categories: {},
    });
  });
});

describe('getGoalsForChoice', () => {
  it('finds the goal values for the selected categories', () => {
    expect(getGoalsForChoice(metric, {})).toEqual(EMISSIONS_GOAL_VALUES.all);
    expect(getGoalsForChoice(metric, undefined)).toEqual(EMISSIONS_GOAL_VALUES.all);
    expect(
      getGoalsForChoice(metric, { [em.sector]: { groups: null, categories: [em.buildings] } })
    ).toEqual(EMISSIONS_GOAL_VALUES.buildings);
  });

  it('returns null when no goal matches', () => {
    expect(
      getGoalsForChoice(metric, { [em.sector]: { groups: null, categories: [em.transport] } })
    ).toBeNull();
  });
});

describe('sliceBy', () => {
  it('sums the other dimensions and splits historical and forecast years', () => {
    const slice = sliceBy(metric, em.sector, false, undefined);
    expect(slice?.historicalYears).toEqual([2020, 2021]);
    expect(slice?.forecastYears).toEqual([2022, 2023]);
    expect(slice?.dimensionLabel).toBe('Sector');
    expect(slice?.unit).toBe('kt/a');
    expect(summary(slice)).toEqual([
      { id: em.buildings, historical: [17, 20], forecast: [23, 26] },
      { id: em.transport, historical: [20, 21], forecast: [22, 23] },
    ]);
    expect(slice?.totalValues?.historicalValues).toEqual([37, 41]);
    expect(slice?.totalValues?.forecastValues).toEqual([45, 49]);
  });

  it('drops categories that are all zeros or have no data', () => {
    const ids = summary(sliceBy(metric, em.sector, false, undefined))?.map((cv) => cv.id);
    expect(ids).not.toContain(em.waste);
    expect(ids).not.toContain(em.agriculture);
  });

  it('keeps categories reported as zero with filterZero off, but not those without data', () => {
    const slice = sliceBy(metric, em.sector, false, undefined, true, { filterZero: false });
    expect(summary(slice)).toEqual([
      { id: em.buildings, historical: [17, 20], forecast: [23, 26] },
      { id: em.transport, historical: [20, 21], forecast: [22, 23] },
      { id: em.waste, historical: [0, 0], forecast: [0, 0] },
    ]);
  });

  it('slices a grouped dimension by its groups', () => {
    expect(summary(sliceBy(metric, em.scope, false, undefined))).toEqual([
      { id: em.direct, historical: [35, 38], forecast: [41, 44] },
      { id: em.indirect, historical: [2, 3], forecast: [4, 5] },
    ]);
  });

  it('slices a grouped dimension by its groups also when it is filtered', () => {
    const choice = { [em.scope]: { groups: [em.indirect], categories: [em.scope3] } };
    expect(summary(sliceBy(metric, em.scope, false, choice))).toEqual([
      { id: em.indirect, historical: [2, 3], forecast: [4, 5] },
    ]);
  });

  it('slices a grouped dimension by its categories without useGroups', () => {
    expect(summary(sliceBy(metric, em.scope, false, undefined, false))).toEqual([
      { id: em.scope1, historical: [30, 32], forecast: [34, 36] },
      { id: em.scope2, historical: [5, 6], forecast: [7, 8] },
      { id: em.scope3, historical: [2, 3], forecast: [4, 5] },
    ]);
  });

  it('applies the filters of other dimensions', () => {
    const choice = { [em.scope]: { groups: [em.indirect], categories: [em.scope3] } };
    expect(summary(sliceBy(metric, em.sector, false, choice))).toEqual([
      { id: em.buildings, historical: [2, 3], forecast: [4, 5] },
    ]);
  });

  it('treats an empty category filter as no filter', () => {
    const choice = { [em.sector]: { groups: null, categories: [] } };
    expect(summary(sliceBy(metric, em.sector, false, choice))).toEqual(
      summary(sliceBy(metric, em.sector, false, undefined))
    );
  });

  it('puts categories with an explicit order first, in that order', () => {
    const slice = sliceBy(parseMetric(ordered), dimId('ordered', 'sector'), true, undefined);
    expect(slice?.categoryValues.map((cv) => cv.category.label)).toEqual([
      'First',
      'Second',
      'Unordered',
    ]);
  });

  it('sorts the other categories by their latest historical value', () => {
    const slice = sliceBy(metric, em.sector, true, undefined);
    expect(slice?.categoryValues.map((cv) => cv.category.id)).toEqual([em.transport, em.buildings]);
  });

  it('[common] keeps negative categories first when sorting, and marks them negative', () => {
    const slice = sliceBy(parseMetric(sinks), dimId('sinks', 'sector'), true, undefined);
    expect(slice?.categoryValues.map((cv) => cv.category.label)).toEqual([
      'Sinks',
      'Transport',
      'Buildings',
    ]);
    expect(slice?.categoryValues.find((cv) => cv.category.label === 'Sinks')?.isNegative).toBe(
      true
    );
  });
});

describe('flatten', () => {
  it('sums everything into one series named after the metric', () => {
    const slice = flatten(metric, undefined);
    expect(slice.dimensionLabel).toBe('Greenhouse gas emissions');
    expect(slice.totalValues).toBeNull();
    expect(summary(slice)).toEqual([{ id: 'emissions', historical: [37, 41], forecast: [45, 49] }]);
  });

  it('applies the filters', () => {
    const choice = { [em.sector]: { groups: null, categories: [em.buildings] } };
    expect(summary(flatten(metric, choice))?.[0]).toEqual({
      id: 'emissions',
      historical: [17, 20],
      forecast: [23, 26],
    });
  });
});

describe('getSingleYear', () => {
  // Two dimensions: rows by sector, columns by scope group
  const SECTOR_SCOPE_VALUES: Record<string, Record<string, number>> = {
    buildings: { scope1: 10, scope2: 5, scope3: 2 },
    transport: { scope1: 20, scope2: 1, scope3: 3 },
  };
  const sectorScope = parseMetric(
    buildMetric({
      id: 'ss',
      name: 'Sector and scope',
      years: [2020],
      forecastFrom: null,
      dimensions: [
        {
          key: 'sector',
          label: 'Sector',
          categories: [
            { key: 'buildings', label: 'Buildings' },
            { key: 'transport', label: 'Transport' },
          ],
        },
        {
          key: 'scope',
          label: 'Scope',
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
      value: (cell) => SECTOR_SCOPE_VALUES[cell.sector][cell.scope],
    })
  );

  it('[common] sums the categories of a group', () => {
    const year = getSingleYear(sectorScope, 2020, undefined);
    expect(year.categoryTypes.map((ct) => ct.options)).toEqual([
      [catId('ss', 'sector', 'buildings'), catId('ss', 'sector', 'transport')],
      [catId('ss', 'scope', 'direct'), catId('ss', 'scope', 'indirect')],
    ]);
    expect(year.rows).toEqual([
      [15, 2],
      [21, 3],
    ]);
  });
});

describe('downloadData', () => {
  let downloads: { filename: string; text: Promise<string> }[];

  const readBlob = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).replace(/^\uFEFF/, ''));
      reader.readAsText(blob);
    });

  beforeEach(() => {
    downloads = [];
    // Only the clock is pinned; FileReader needs timers to run
    jest.useFakeTimers({ now: new Date(2026, 0, 2, 3, 4), advanceTimers: true });
    let blob: Blob | null = null;
    URL.createObjectURL = jest.fn((obj: Blob) => {
      blob = obj;
      return 'blob:metric';
    });
    URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push({ filename: this.download, text: readBlob(blob!) });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const csv = async (config: SliceConfig, filterZero?: boolean, source = metric) => {
    await downloadData(source, config, 'csv', { filterZero });
    expect(downloads).toHaveLength(1);
    return (await downloads[0].text).split('\r\n');
  };

  it('writes a row per category and a column per year', async () => {
    expect(await csv({ dimensionId: em.sector, categories: {} })).toEqual([
      '"Sector";"2020";"2021";"2022";"2023"',
      '"Buildings";17;20;23;26',
      '"Transport";20;21;22;23',
    ]);
  });

  it('names the file after the metric and the time', async () => {
    await csv({ dimensionId: em.sector, categories: {} });
    expect(downloads[0].filename).toBe('greenhouse_gas_emissions_2026-01-02_0304.csv');
  });

  it('keeps zero-valued categories with filterZero off', async () => {
    const lines = await csv({ dimensionId: em.sector, categories: {} }, false);
    expect(lines).toContain('"Waste";0;0;0;0');
  });

  it('exports a grouped dimension by its groups', async () => {
    expect(await csv({ dimensionId: em.scope, categories: {} })).toEqual([
      '"Scope";"2020";"2021";"2022";"2023"',
      '"Direct";35;38;41;44',
      '"Indirect";2;3;4;5',
    ]);
  });

  it('exports the sum of everything without a breakdown', async () => {
    expect(await csv({ dimensionId: undefined, categories: {} })).toEqual([
      '"Greenhouse gas emissions";"2020";"2021";"2022";"2023"',
      '"Greenhouse gas emissions";37;41;45;49',
    ]);
  });

  it('keeps the full precision of the values', async () => {
    const lines = await csv(
      { dimensionId: dimId('precise', 'sector'), categories: {} },
      undefined,
      parseMetric(precise)
    );
    expect(lines[1]).toBe('"A";1234.5678');
  });

  it('names the file in plain ASCII', async () => {
    const named = parseMetric({ ...precise, name: 'Treibhausgasemissionen: Gebäude, Straße' });
    await csv({ dimensionId: dimId('precise', 'sector'), categories: {} }, undefined, named);
    expect(downloads[0].filename).toBe(
      'treibhausgasemissionen_gebaude_strasse_2026-01-02_0304.csv'
    );
  });

  describe('[common] with a row per year', () => {
    const labels = {
      total: 'Total',
      type: 'Type',
      year: 'Year',
      unit: 'Unit',
      historical: 'Historical',
      forecast: 'Forecast (Net zero)',
    };
    const yearCsv = async (
      config: SliceConfig,
      options: { years?: number[]; source?: typeof metric } = {}
    ) => {
      await downloadData(options.source ?? metric, config, 'csv', {
        layout: 'years',
        tableTitle: 'Emissions, Net zero',
        labels,
        years: options.years,
      });
      return (await downloads[0].text).split('\r\n');
    };

    it('writes a row per year with its type, and a total column', async () => {
      expect(await yearCsv({ dimensionId: em.sector, categories: {} })).toEqual([
        '"Year";"Type";"Unit";"Buildings";"Transport";"Total"',
        '"2020";"Historical";"kt/a";17;20;37',
        '"2021";"Historical";"kt/a";20;21;41',
        '"2022";"Forecast (Net zero)";"kt/a";23;22;45',
        '"2023";"Forecast (Net zero)";"kt/a";26;23;49',
      ]);
    });

    it('names the file after the table title', async () => {
      await yearCsv({ dimensionId: em.sector, categories: {} });
      expect(downloads[0].filename).toBe('emissions_net_zero.csv');
    });

    it('writes only the given years', async () => {
      const lines = await yearCsv(
        { dimensionId: em.sector, categories: {} },
        { years: [2021, 2022] }
      );
      expect(lines.slice(1).map((line) => line.split(';')[0])).toEqual(['"2021"', '"2022"']);
    });

    it('exports a grouped dimension by its groups', async () => {
      const lines = await yearCsv({ dimensionId: em.scope, categories: {} });
      expect(lines[0]).toBe('"Year";"Type";"Unit";"Direct";"Indirect";"Total"');
      expect(lines[1]).toBe('"2020";"Historical";"kt/a";35;2;37');
    });

    it('keeps the full precision of the values', async () => {
      const lines = await yearCsv(
        { dimensionId: dimId('precise', 'sector'), categories: {} },
        { source: parseMetric(precise) }
      );
      expect(lines[1]).toBe('"2020";"Historical";"kt/a";1234.5678;1234.5678');
    });
  });
});
