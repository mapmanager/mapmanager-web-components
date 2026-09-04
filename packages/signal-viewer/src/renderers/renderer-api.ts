import type {
  LoadedSignalFrame,
  SignalAxisRange,
  SignalAxisRangeSetting,
  SignalAxisId,
  SignalCursorChange,
  SignalCursorState,
  SignalDescription,
  SignalOverlays,
  SignalViewerTheme,
  SignalViewport,
  SignalYAxisId,
} from '../core'

/** Renderer-to-controller interaction callbacks. */
export interface SignalRendererCallbacks {
  viewportChange(viewport: SignalViewport): void
  overlaySelect(id: string | null): void
  cursorChange(change: SignalCursorChange): void
  resetViewRequest(): void
  traceVisibilityRequest(id: string, visible: boolean): void
}

/** Optional policies for installing a newly loaded frame. */
export interface SignalFrameOptions {
  preserveYAxisRange?: boolean
}

/** Replaceable visual boundary used by the signal-viewer widget. */
export interface SignalRenderer {
  setDescription(description: SignalDescription): void
  setFrame(frame: LoadedSignalFrame, options?: SignalFrameOptions): void
  setOverlays(overlays: SignalOverlays): void
  setCursors(cursors: SignalCursorState): void
  setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void
  getAxisRange(axis: SignalYAxisId): SignalAxisRange | null
  resetYAxisRanges(): void
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
  setViewport(viewport: SignalViewport): void
  resize(width: number, height: number): void
  destroy(): void
}
