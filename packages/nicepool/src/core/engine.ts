import { DatasetStore } from './dataset'
import { SelectionModel } from './selection'
import {
  defaultNicePoolState,
  validateNicePoolPreset,
  validateNicePoolState,
  validatePlotState,
  visiblePlotCount,
} from './state'
import type { DatasetInput, NicePoolPreset, NicePoolSelection, NicePoolState, PlotLayout, PlotState, RowId } from './types'
import { preparePlotData } from '../plots/prepare'
import { summarizePlot } from '../plots/summary'
import type { PreparedPlot } from '../plots/types'

/** Framework-independent owner of NicePool data, state, and selection. */
export class NicePoolEngine {
  #dataset: DatasetStore | null = null
  #state: NicePoolState | null = null
  readonly #selection = new SelectionModel()

  get dataset(): DatasetStore {
    if (!this.#dataset) throw new Error('NicePool has no dataset; call setData first')
    return this.#dataset
  }

  get plotState(): PlotState {
    return this.state.plots[this.state.activePlotIndex]!
  }

  get state(): NicePoolState {
    if (!this.#state) throw new Error('NicePool has no state; call setData first')
    return this.#state
  }

  get selection(): NicePoolSelection {
    return this.#selection.value
  }

  /** Replace the dataset and reset all dataset-dependent state, including selection. */
  setData(input: DatasetInput): void {
    const dataset = new DatasetStore(input)
    this.#dataset = dataset
    this.#selection.reset()
    this.#state = defaultNicePoolState(dataset)
  }

  /** Replace rows while preserving the complete workspace when it remains valid. */
  replaceData(input: DatasetInput): void {
    if (!this.#dataset || !this.#state) throw new Error('NicePool has no dataset; call setData first')
    const dataset = new DatasetStore(input)
    const state = validateNicePoolState(dataset, this.#state)
    for (let index = 0; index < visiblePlotCount(state.layout); index += 1) {
      preparePlotData(dataset, state.plots[index]!)
    }
    const validIds = new Set(dataset.rowIndexById.keys())
    const selection = this.#selection.pruned(validIds)

    this.#dataset = dataset
    this.#state = state
    this.#selection.set(selection, validIds)
  }

  setState(state: NicePoolState): void {
    const validated = validateNicePoolState(this.dataset, state)
    for (let index = 0; index < visiblePlotCount(validated.layout); index += 1) {
      preparePlotData(this.dataset, validated.plots[index]!)
    }
    this.#state = validated
  }

  setPlotState(state: PlotState, plotIndex = this.state.activePlotIndex): void {
    if (!Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex > 3) throw new RangeError('plotIndex must be 0 through 3')
    const validated = validatePlotState(this.dataset, state)
    preparePlotData(this.dataset, validated)
    const plots = [...this.state.plots] as unknown as [PlotState, PlotState, PlotState, PlotState]
    plots[plotIndex] = validated
    this.#state = { ...this.state, plots }
  }

  setLayout(layout: PlotLayout): void {
    const visible = visiblePlotCount(layout)
    this.#state = { ...this.state, layout, activePlotIndex: Math.min(this.state.activePlotIndex, visible - 1) }
  }

  setActivePlot(plotIndex: number): void {
    if (!Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex >= visiblePlotCount(this.state.layout)) {
      throw new RangeError('Active plot must be visible in the current layout')
    }
    this.#state = { ...this.state, activePlotIndex: plotIndex }
  }

  setSelection(selection: NicePoolSelection): void {
    this.#selection.set(selection, new Set(this.dataset.rowIndexById.keys()))
  }

  /** Add rows to the existing selection without removing previously selected rows. */
  extendSelection(rowIds: readonly RowId[], primaryRowId: RowId | null = null): void {
    this.setSelection({
      primaryRowId: primaryRowId ?? this.selection.primaryRowId,
      selectedRowIds: [...this.selection.selectedRowIds, ...rowIds],
    })
  }

  setPrimarySelection(rowId: RowId | null): void {
    this.setSelection(rowId === null ? { primaryRowId: null, selectedRowIds: [] } : { primaryRowId: rowId, selectedRowIds: [rowId] })
  }

  clearSelection(): void {
    this.#selection.reset()
  }

  preparePlot(plotIndex = this.state.activePlotIndex): PreparedPlot {
    const data = preparePlotData(this.dataset, this.state.plots[plotIndex]!)
    return { data, summary: summarizePlot(data) }
  }

  prepareVisiblePlots(): readonly PreparedPlot[] {
    return Array.from({ length: visiblePlotCount(this.state.layout) }, (_, index) => this.preparePlot(index))
  }

  applyNicePoolPreset(preset: NicePoolPreset): void {
    this.setState(validateNicePoolPreset(this.dataset, preset).state)
  }
}
