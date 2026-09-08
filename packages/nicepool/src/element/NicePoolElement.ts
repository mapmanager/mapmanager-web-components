import { createApp, h, ref, type App, type ComponentPublicInstance } from 'vue'

import type { DatasetInput, NicePoolPreset, NicePoolSelection, NicePoolState, NicePoolTheme, RowId } from '../core/types'
import type { PlotSummary } from '../plots/types'
import NicePoolWidget from '../vue/NicePoolWidget.vue'
import widgetStyles from '../vue/widget.css?inline'

interface WidgetApi {
  setData(input: DatasetInput): void
  setState(state: NicePoolState): void
  getState(): NicePoolState
  setNicePoolPresets(presets: readonly NicePoolPreset[]): void
  getNicePoolPresets(): NicePoolPreset[]
  applyNicePoolPreset(name: string): void
  setShowPresetEditing(visible: boolean): void
  getShowPresetEditing(): boolean
  setSelection(selection: NicePoolSelection): void
  setPrimarySelection(rowId: RowId | null): void
  clearSelection(): void
  getSelection(): NicePoolSelection
  getPlotSummary(): PlotSummary | null
  setTheme(theme: NicePoolTheme): void
  getTheme(): NicePoolTheme
}

/** Framework-neutral browser element backed by the same Vue view and pure engine. */
export class NicePoolElement extends HTMLElement {
  #app: App<Element> | null = null
  #widget = ref<(ComponentPublicInstance & WidgetApi) | null>(null)
  #pendingDataset: DatasetInput | null = null
  #pendingState: NicePoolState | null = null
  #pendingPresets: readonly NicePoolPreset[] | null = null
  #showPresetEditing = true

  connectedCallback(): void {
    if (this.#app) return
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = widgetStyles
    const mount = document.createElement('div')
    shadow.replaceChildren(style, mount)
    this.#app = createApp({
      render: () => h(NicePoolWidget, {
        ref: this.#widget,
        showPresetEditing: this.#showPresetEditing,
        onSelectionChange: (selection: NicePoolSelection) => {
          this.dispatchEvent(new CustomEvent('nicepool-selection-change', {
            detail: selection,
            bubbles: true,
            composed: true,
          }))
        },
        onDataReset: () => {
          this.dispatchEvent(new CustomEvent('nicepool-data-reset', { bubbles: true, composed: true }))
        },
        onStateChange: (state: NicePoolState) => {
          this.dispatchEvent(new CustomEvent('nicepool-state-change', {
            detail: state,
            bubbles: true,
            composed: true,
          }))
        },
        onPresetsChange: (presets: NicePoolPreset[]) => {
          this.dispatchEvent(new CustomEvent('nicepool-presets-change', {
            detail: presets,
            bubbles: true,
            composed: true,
          }))
        },
        onThemeChange: (theme: NicePoolTheme) => {
          this.dispatchEvent(new CustomEvent('nicepool-theme-change', {
            detail: theme,
            bubbles: true,
            composed: true,
          }))
        },
      }),
    })
    this.#app.mount(mount)
    if (this.#pendingDataset) {
      const dataset = this.#pendingDataset
      this.#pendingDataset = null
      queueMicrotask(() => {
        this.#widget.value?.setData(dataset)
        if (this.#pendingState) {
          const state = this.#pendingState
          this.#pendingState = null
          this.#widget.value?.setState(state)
        }
        if (this.#pendingPresets) {
          const presets = this.#pendingPresets
          this.#pendingPresets = null
          this.#widget.value?.setNicePoolPresets(presets)
        }
      })
    }
  }

  disconnectedCallback(): void {
    this.#app?.unmount()
    this.#app = null
    this.#widget.value = null
  }

  /** Replace data and reset selection, plot state, filters, and derived views. */
  setData(input: DatasetInput): void {
    this.#pendingState = null
    if (!this.#widget.value) {
      this.#pendingDataset = input
      return
    }
    this.#widget.value.setData(input)
  }

  setSelection(selection: NicePoolSelection): void {
    this.#widget.value?.setSelection(selection)
  }

  setState(state: NicePoolState): void {
    if (!this.#widget.value) {
      this.#pendingState = state
      return
    }
    this.#widget.value.setState(state)
  }
  getState(): NicePoolState {
    if (!this.#widget.value) throw new Error('NicePool element is not connected')
    return this.#widget.value.getState()
  }
  setNicePoolPresets(presets: readonly NicePoolPreset[]): void {
    if (!this.#widget.value) { this.#pendingPresets = presets; return }
    this.#widget.value.setNicePoolPresets(presets)
  }
  getNicePoolPresets(): NicePoolPreset[] { return this.#widget.value?.getNicePoolPresets() ?? [] }
  applyNicePoolPreset(name: string): void { this.#widget.value?.applyNicePoolPreset(name) }
  setShowPresetEditing(visible: boolean): void {
    this.#showPresetEditing = visible
    this.#widget.value?.setShowPresetEditing(visible)
  }
  getShowPresetEditing(): boolean { return this.#widget.value?.getShowPresetEditing() ?? this.#showPresetEditing }
  setTheme(theme: NicePoolTheme): void { this.#widget.value?.setTheme(theme) }
  getTheme(): NicePoolTheme { return this.#widget.value?.getTheme() ?? 'dark' }

  setPrimarySelection(rowId: RowId | null): void {
    this.#widget.value?.setPrimarySelection(rowId)
  }

  clearSelection(): void {
    this.#widget.value?.clearSelection()
  }

  getSelection(): NicePoolSelection {
    return this.#widget.value?.getSelection() ?? { primaryRowId: null, selectedRowIds: [] }
  }

  getPlotSummary(): PlotSummary | null {
    return this.#widget.value?.getPlotSummary() ?? null
  }
}
