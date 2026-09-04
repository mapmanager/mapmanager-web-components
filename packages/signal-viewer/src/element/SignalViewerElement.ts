import { createApp, h, ref, type App, type ComponentPublicInstance } from 'vue'

import type {
  InMemorySignalSourceOptions, SignalAxisId, SignalAxisRange, SignalAxisRangeSetting, SignalCursor,
  SignalCursorChange, SignalCursorId, SignalCursorState, SignalOverlays, SignalSource,
  SignalScatterSeries, SignalScatterSeriesUpdate, SignalTrace, SignalTraceUpdate,
  SignalViewport, SignalYAxisId,
  SignalViewerTheme,
} from '../core'
import SignalViewerWidget from '../vue/SignalViewerWidget.vue'
import widgetStyles from '../vue/widget.css?inline'

interface WidgetApi {
  setSource(source: SignalSource): Promise<void>
  setTraces(traces: readonly SignalTrace[], options?: InMemorySignalSourceOptions): Promise<void>
  addTrace(trace: SignalTrace): Promise<void>
  updateTrace(id: string, update: SignalTraceUpdate): Promise<void>
  setTraceVisible(id: string, visible: boolean): Promise<void>
  getVisibleTraces(): readonly string[]
  setViewport(viewport: SignalViewport): Promise<void>
  getViewport(): SignalViewport | null
  resetView(): Promise<void>
  setOverlays(overlays: SignalOverlays): void
  setScatterSeries(series: readonly SignalScatterSeries[]): void
  addScatterSeries(series: SignalScatterSeries): void
  updateScatterSeries(id: string, update: SignalScatterSeriesUpdate): void
  setScatterSeriesVisible(id: string, visible: boolean): void
  getVisibleScatterSeries(): readonly string[]
  setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void
  getAxisRange(axis: SignalYAxisId): SignalAxisRange | null
  setAxisVisible(axis: SignalAxisId, visible: boolean): void
  getAxisVisible(axis: SignalAxisId): boolean
  setGridVisible(axis: SignalAxisId, visible: boolean): void
  getGridVisible(axis: SignalAxisId): boolean
  setHoverVisible(visible: boolean): void
  getHoverVisible(): boolean
  setLegendVisible(visible: boolean): void
  getLegendVisible(): boolean
  setTheme(theme: SignalViewerTheme): void
  getTheme(): SignalViewerTheme
  setCursor(id: SignalCursorId, value: number): void
  setCursorVisible(id: SignalCursorId, visible: boolean): void
  setCursors(cursors: readonly SignalCursor[]): void
  getCursor(id: SignalCursorId): SignalCursor
  getCursors(): SignalCursorState
}

/** Framework-neutral custom-element host for the Vue signal viewer. */
export class SignalViewerElement extends HTMLElement {
  #app: App<Element> | null = null
  #widget = ref<(ComponentPublicInstance & WidgetApi) | null>(null)
  #pendingSource: SignalSource | null = null

  connectedCallback(): void {
    if (this.#app) return
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = widgetStyles
    const mount = document.createElement('div')
    mount.style.height = '100%'
    shadow.replaceChildren(style, mount)
    this.#app = createApp({
      render: () => h(SignalViewerWidget, {
        ref: this.#widget,
        onSourceChange: (id: string) => this.#dispatch('source-change', id),
        onViewChange: (viewport: SignalViewport) => this.#dispatch('view-change', viewport),
        onOverlaySelect: (id: string | null) => this.#dispatch('overlay-select', id),
        onCursorChange: (change: SignalCursorChange) => this.#dispatch('cursor-change', change),
      }),
    })
    this.#app.mount(mount)
    if (this.#pendingSource) {
      const source = this.#pendingSource
      this.#pendingSource = null
      queueMicrotask(() => void this.#widget.value?.setSource(source))
    }
  }

  disconnectedCallback(): void {
    this.#app?.unmount()
    this.#app = null
    this.#widget.value = null
  }

  /** Replace the complete session with an asynchronous range source. */
  setSource(source: SignalSource): Promise<void> {
    if (!this.#widget.value) {
      this.#pendingSource = source
      return Promise.resolve()
    }
    return this.#widget.value.setSource(source)
  }

  /** Replace the complete session with aligned in-memory traces. */
  setTraces(traces: readonly SignalTrace[], options?: InMemorySignalSourceOptions): Promise<void> {
    return this.#requireWidget().setTraces(traces, options)
  }

  /** Add one aligned in-memory trace with a stable ID. */
  addTrace(trace: SignalTrace): Promise<void> { return this.#requireWidget().addTrace(trace) }

  /** Update one in-memory trace without changing its ID. */
  updateTrace(id: string, update: SignalTraceUpdate): Promise<void> {
    return this.#requireWidget().updateTrace(id, update)
  }

  /** Show or hide one trace. */
  setTraceVisible(id: string, visible: boolean): Promise<void> {
    return this.#requireWidget().setTraceVisible(id, visible)
  }

  /** Return visible trace IDs in source declaration order. */
  getVisibleTraces(): readonly string[] { return this.#requireWidget().getVisibleTraces() }

  /** Replace the calibrated visible X interval. */
  setViewport(viewport: SignalViewport): Promise<void> { return this.#requireWidget().setViewport(viewport) }

  /** Return the current calibrated X viewport. */
  getViewport(): SignalViewport | null { return this.#requireWidget().getViewport() }

  /** Restore the complete calibrated X range. */
  resetView(): Promise<void> { return this.#requireWidget().resetView() }

  /** Replace all sparse point and interval overlays. */
  setOverlays(overlays: SignalOverlays): void { this.#requireWidget().setOverlays(overlays) }

  /** Replace all named scatter overlays while preserving interval overlays. */
  setScatterSeries(series: readonly SignalScatterSeries[]): void {
    this.#requireWidget().setScatterSeries(series)
  }

  /** Add one named scatter overlay with a stable ID. */
  addScatterSeries(series: SignalScatterSeries): void {
    this.#requireWidget().addScatterSeries(series)
  }

  /** Update one named scatter overlay without changing its stable ID. */
  updateScatterSeries(id: string, update: SignalScatterSeriesUpdate): void {
    this.#requireWidget().updateScatterSeries(id, update)
  }

  /** Show or hide one named scatter overlay. */
  setScatterSeriesVisible(id: string, visible: boolean): void {
    this.#requireWidget().setScatterSeriesVisible(id, visible)
  }

  /** Return visible scatter-series IDs in declaration order. */
  getVisibleScatterSeries(): readonly string[] {
    return this.#requireWidget().getVisibleScatterSeries()
  }

  /** Set one Y axis to automatic or explicit range control. */
  setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void {
    this.#requireWidget().setAxisRange(axis, range)
  }

  /** Return the currently rendered range for one Y axis. */
  getAxisRange(axis: SignalYAxisId): SignalAxisRange | null { return this.#requireWidget().getAxisRange(axis) }

  /** Show or hide X-axis or combined Y-axis chrome. */
  setAxisVisible(axis: SignalAxisId, visible: boolean): void {
    this.#requireWidget().setAxisVisible(axis, visible)
  }

  /** Return whether X-axis or combined Y-axis chrome is visible. */
  getAxisVisible(axis: SignalAxisId): boolean {
    return this.#requireWidget().getAxisVisible(axis)
  }

  /** Show or hide vertical X or horizontal Y grid lines. */
  setGridVisible(axis: SignalAxisId, visible: boolean): void {
    this.#requireWidget().setGridVisible(axis, visible)
  }

  /** Return whether vertical X or horizontal Y grid lines are visible. */
  getGridVisible(axis: SignalAxisId): boolean {
    return this.#requireWidget().getGridVisible(axis)
  }

  /** Show or hide the hover crosshair and trace-position symbols. */
  setHoverVisible(visible: boolean): void {
    this.#requireWidget().setHoverVisible(visible)
  }

  /** Return whether the hover crosshair and trace-position symbols are visible. */
  getHoverVisible(): boolean {
    return this.#requireWidget().getHoverVisible()
  }

  /** Show or hide the trace legend. */
  setLegendVisible(visible: boolean): void { this.#requireWidget().setLegendVisible(visible) }

  /** Return whether the trace legend is visible. */
  getLegendVisible(): boolean { return this.#requireWidget().getLegendVisible() }

  /** Apply the centralized light or dark viewer palette. */
  setTheme(theme: SignalViewerTheme): void { this.#requireWidget().setTheme(theme) }

  /** Return the active viewer palette. */
  getTheme(): SignalViewerTheme { return this.#requireWidget().getTheme() }

  /** Set and show one A/B/C/D cursor without emitting an event. */
  setCursor(id: SignalCursorId, value: number): void { this.#requireWidget().setCursor(id, value) }

  /** Show or hide one A/B/C/D cursor without emitting an event. */
  setCursorVisible(id: SignalCursorId, visible: boolean): void {
    this.#requireWidget().setCursorVisible(id, visible)
  }

  /** Replace complete A/B/C/D cursor state without emitting an event. */
  setCursors(cursors: readonly SignalCursor[]): void { this.#requireWidget().setCursors(cursors) }

  /** Return a defensive copy of one cursor. */
  getCursor(id: SignalCursorId): SignalCursor { return this.#requireWidget().getCursor(id) }

  /** Return defensive copies of complete cursor state. */
  getCursors(): SignalCursorState { return this.#requireWidget().getCursors() }

  #requireWidget(): ComponentPublicInstance & WidgetApi {
    if (!this.#widget.value) throw new Error('signal viewer is not connected')
    return this.#widget.value
  }

  #dispatch<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }
}
