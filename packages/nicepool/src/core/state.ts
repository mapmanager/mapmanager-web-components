import { DatasetStore } from './dataset'
import {
  StateValidationError,
  type DatasetInput,
  type NicePoolPreset,
  type NicePoolState,
  type NicePoolStateOverrides,
  type PlotLayout,
  type PlotState,
} from './types'

const LAYOUT_COUNTS: Readonly<Record<PlotLayout, number>> = {
  '1x1': 1,
  '1x2': 2,
  '2x1': 2,
  '2x2': 4,
}
const PLOT_STATE_KEYS = new Set([
  'plotType', 'preFilters', 'xColumn', 'yColumn', 'groupColumn', 'colorColumn',
  'useAbsoluteValue', 'removeValuesThreshold', 'swarmJitterAmount', 'swarmGroupOffset',
  'jitterSeed', 'histogramBins', 'showRaw', 'showMean', 'showErrorBars', 'errorBarType', 'pointSize',
  'showLegend', 'legendPosition', 'showPlotlyToolbar', 'showHover', 'showAxes',
  'showHorizontalGrid', 'showVerticalGrid', 'cvEpsilon',
])

/** Return the number of visible plot slots for a layout. */
export function visiblePlotCount(layout: PlotLayout): number {
  const count = LAYOUT_COUNTS[layout]
  if (count === undefined) throw new StateValidationError(`Unsupported layout ${JSON.stringify(layout)}`)
  return count
}

/** Build a valid, conservative plot state for a newly initialized dataset. */
export function defaultPlotState(dataset: DatasetStore): PlotState {
  const numeric = dataset.numericColumns()
  const xColumn = numeric[0] ?? ''
  const yColumn = numeric[1] ?? numeric[0] ?? ''
  const groupColumn = dataset.preFilterColumns()[0] ?? null
  return {
    plotType: 'scatter',
    preFilters: {},
    xColumn,
    yColumn,
    groupColumn,
    colorColumn: null,
    useAbsoluteValue: false,
    removeValuesThreshold: null,
    swarmJitterAmount: 0.35,
    swarmGroupOffset: 0.3,
    jitterSeed: 17,
    histogramBins: 50,
    showRaw: true,
    showMean: true,
    showErrorBars: false,
    errorBarType: 'sem',
    pointSize: 7,
    showLegend: true,
    legendPosition: 'bottom',
    showPlotlyToolbar: true,
    showHover: false,
    showAxes: true,
    showHorizontalGrid: true,
    showVerticalGrid: true,
    cvEpsilon: 0.01,
  }
}

/** Build four independent plot states after a complete dataset replacement. */
export function defaultNicePoolState(dataset: DatasetStore): NicePoolState {
  const plots = Array.from({ length: 4 }, () => ({ ...defaultPlotState(dataset), preFilters: {} })) as [
    PlotState,
    PlotState,
    PlotState,
    PlotState,
  ]
  return { schemaVersion: 1, layout: '1x1', activePlotIndex: 0, plots }
}

/** Build a complete valid workspace from dataset-aware defaults and narrow overrides. */
export function createNicePoolState(input: DatasetInput, overrides: NicePoolStateOverrides = {}): NicePoolState {
  const dataset = new DatasetStore(input)
  const defaults = defaultNicePoolState(dataset)
  const unknownKeys = Object.keys(overrides).filter((key) => !['layout', 'activePlotIndex', 'plots'].includes(key))
  if (unknownKeys.length) throw new StateValidationError(`Unknown NicePoolState override ${JSON.stringify(unknownKeys[0])}`)
  if (overrides.plots && overrides.plots.length > 4) {
    throw new StateValidationError('NicePoolState overrides may contain at most four plots')
  }
  const plots = defaults.plots.map((plot, index) => ({
    ...plot,
    ...(overrides.plots?.[index] ?? {}),
    preFilters: { ...plot.preFilters, ...(overrides.plots?.[index]?.preFilters ?? {}) },
  })) as unknown as NicePoolState['plots']
  return validateNicePoolState(dataset, {
    ...defaults,
    layout: overrides.layout ?? defaults.layout,
    activePlotIndex: overrides.activePlotIndex ?? defaults.activePlotIndex,
    plots,
  })
}

function requiredColumn(dataset: DatasetStore, column: string, label: string): void {
  if (!dataset.schema.some(({ name }) => name === column)) {
    throw new StateValidationError(`${label} references unknown column ${JSON.stringify(column)}`)
  }
  if (column === dataset.rowIdColumn) throw new StateValidationError(`${label} cannot use the row-ID column`)
}

function boundedNumber(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new StateValidationError(`${label} must be between ${minimum} and ${maximum}`)
  }
}

/** Strictly validate a complete plot state against the active dataset. */
export function validatePlotState(dataset: DatasetStore, state: PlotState): PlotState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new StateValidationError('PlotState must be an object')
  }
  const unknownKeys = Object.keys(state).filter((key) => !PLOT_STATE_KEYS.has(key))
  if (unknownKeys.length) throw new StateValidationError(`Unknown PlotState field ${JSON.stringify(unknownKeys[0])}`)
  const candidate = structuredClone(state)
  for (const field of [
    'useAbsoluteValue', 'showRaw', 'showMean', 'showErrorBars', 'showLegend',
    'showPlotlyToolbar', 'showHover', 'showAxes', 'showHorizontalGrid', 'showVerticalGrid',
  ] as const) {
    if (typeof candidate[field] !== 'boolean') throw new StateValidationError(`${field} must be boolean`)
  }
  if (!state.preFilters || typeof state.preFilters !== 'object' || Array.isArray(state.preFilters)) {
    throw new StateValidationError('preFilters must be an object')
  }
  if (!['scatter', 'swarm', 'box', 'violin', 'histogram', 'cumulativeHistogram'].includes(candidate.plotType)) throw new StateValidationError(`Unsupported plot type ${JSON.stringify(candidate.plotType)}`)
  requiredColumn(dataset, candidate.xColumn, 'xColumn')
  requiredColumn(dataset, candidate.yColumn, 'yColumn')
  if (!dataset.numericColumns().includes(candidate.yColumn)) throw new StateValidationError('yColumn must be numeric')
  if (['histogram', 'cumulativeHistogram'].includes(candidate.plotType) && !dataset.numericColumns().includes(candidate.xColumn)) throw new StateValidationError('Histogram xColumn must be numeric')
  if (candidate.groupColumn !== null) requiredColumn(dataset, candidate.groupColumn, 'groupColumn')
  if (['swarm', 'box', 'violin'].includes(candidate.plotType) && candidate.groupColumn === null) throw new StateValidationError(`${candidate.plotType} requires groupColumn`)
  if (candidate.colorColumn !== null) requiredColumn(dataset, candidate.colorColumn, 'colorColumn')
  const categorical = new Set(dataset.categoricalColumns())
  if (candidate.groupColumn !== null && !categorical.has(candidate.groupColumn)) throw new StateValidationError('groupColumn must be categorical')
  if (candidate.colorColumn !== null && !categorical.has(candidate.colorColumn)) throw new StateValidationError('colorColumn must be categorical')
  for (const [column, value] of Object.entries(candidate.preFilters)) {
    requiredColumn(dataset, column, 'preFilter')
    if (value === null) throw new StateValidationError('Active preFilter values cannot be null')
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new StateValidationError('Active preFilter values must be finite scalar values')
    }
  }
  if (candidate.removeValuesThreshold !== null) boundedNumber(candidate.removeValuesThreshold, 'removeValuesThreshold', 0, Number.MAX_SAFE_INTEGER)
  boundedNumber(candidate.swarmJitterAmount, 'swarmJitterAmount', 0, 2)
  boundedNumber(candidate.swarmGroupOffset, 'swarmGroupOffset', 0, 2)
  boundedNumber(candidate.jitterSeed, 'jitterSeed', 0, 2147483647)
  boundedNumber(candidate.histogramBins, 'histogramBins', 1, 200)
  boundedNumber(candidate.pointSize, 'pointSize', 1, 30)
  boundedNumber(candidate.cvEpsilon, 'cvEpsilon', 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(candidate.pointSize)) throw new StateValidationError('pointSize must be an integer')
  if (!Number.isInteger(candidate.histogramBins)) throw new StateValidationError('histogramBins must be an integer')
  if (!['std', 'sem'].includes(candidate.errorBarType)) throw new StateValidationError('errorBarType must be std or sem')
  if (!['bottom', 'right', 'top', 'left'].includes(candidate.legendPosition)) {
    throw new StateValidationError('legendPosition must be bottom, right, top, or left')
  }
  return candidate
}

/** Strictly validate a complete four-slot workspace without partial application. */
export function validateNicePoolState(dataset: DatasetStore, state: NicePoolState): NicePoolState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new StateValidationError('NicePoolState must be an object')
  }
  const unknownKeys = Object.keys(state).filter((key) => !['schemaVersion', 'layout', 'activePlotIndex', 'plots'].includes(key))
  if (unknownKeys.length) throw new StateValidationError(`Unknown NicePoolState field ${JSON.stringify(unknownKeys[0])}`)
  if (state.schemaVersion !== 1) throw new StateValidationError('NicePoolState schemaVersion must be 1')
  if (!(state.layout in LAYOUT_COUNTS)) throw new StateValidationError(`Unsupported layout ${JSON.stringify(state.layout)}`)
  if (!Array.isArray(state.plots) || state.plots.length !== 4) throw new StateValidationError('NicePoolState must contain exactly four plots')
  const visible = visiblePlotCount(state.layout)
  if (!Number.isInteger(state.activePlotIndex) || state.activePlotIndex < 0 || state.activePlotIndex >= visible) {
    throw new StateValidationError('activePlotIndex must identify a visible plot')
  }
  return {
    schemaVersion: 1,
    layout: state.layout,
    activePlotIndex: state.activePlotIndex,
    plots: state.plots.map((plot) => validatePlotState(dataset, plot)) as unknown as NicePoolState['plots'],
  }
}

/** Validate a named complete workspace against the active dataset. */
export function validateNicePoolPreset(dataset: DatasetStore, preset: NicePoolPreset): NicePoolPreset {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
    throw new StateValidationError('NicePoolPreset must be an object')
  }
  const unknownKeys = Object.keys(preset).filter((key) => !['schemaVersion', 'name', 'state'].includes(key))
  if (unknownKeys.length) throw new StateValidationError(`Unknown NicePoolPreset field ${JSON.stringify(unknownKeys[0])}`)
  const name = preset.name.trim()
  if (preset.schemaVersion !== 1) throw new StateValidationError('NicePoolPreset schemaVersion must be 1')
  if (!name) throw new StateValidationError('NicePoolPreset name must not be empty')
  return { schemaVersion: 1, name, state: validateNicePoolState(dataset, preset.state) }
}

/** Validate an ordered preset collection atomically and require unique names. */
export function validateNicePoolPresets(dataset: DatasetStore, presets: readonly NicePoolPreset[]): NicePoolPreset[] {
  const validated = presets.map((preset) => validateNicePoolPreset(dataset, preset))
  const names = new Set<string>()
  for (const preset of validated) {
    if (names.has(preset.name)) throw new StateValidationError(`Duplicate NicePoolPreset name ${JSON.stringify(preset.name)}`)
    names.add(preset.name)
  }
  return validated
}
