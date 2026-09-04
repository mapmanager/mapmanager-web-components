import type {
  LoadedSignalFrame,
  SignalAxisRange,
  SignalAxisRangeSetting,
  SignalCursorChange,
  SignalCursorState,
  SignalDescription,
  SignalOverlays,
  SignalViewport,
  SignalYAxisId,
} from '../core'

/** Renderer-to-controller interaction callbacks. */
export interface SignalRendererCallbacks {
  viewportChange(viewport: SignalViewport): void
  overlaySelect(id: string | null): void
  cursorChange(change: SignalCursorChange): void
}

/** Replaceable visual boundary used by the signal-viewer widget. */
export interface SignalRenderer {
  setDescription(description: SignalDescription): void
  setFrame(frame: LoadedSignalFrame): void
  setOverlays(overlays: SignalOverlays): void
  setCursors(cursors: SignalCursorState): void
  setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void
  getAxisRange(axis: SignalYAxisId): SignalAxisRange | null
  setViewport(viewport: SignalViewport): void
  resize(width: number, height: number): void
  destroy(): void
}
