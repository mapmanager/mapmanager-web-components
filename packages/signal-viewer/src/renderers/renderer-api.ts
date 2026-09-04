import type { LoadedSignalFrame, SignalDescription, SignalOverlays, SignalViewport } from '../core'

export interface SignalRendererCallbacks {
  viewportChange(viewport: SignalViewport): void
  overlaySelect(id: string | null): void
}

/** Replaceable visual boundary used by the signal-viewer widget. */
export interface SignalRenderer {
  setDescription(description: SignalDescription): void
  setFrame(frame: LoadedSignalFrame): void
  setOverlays(overlays: SignalOverlays): void
  setViewport(viewport: SignalViewport): void
  resize(width: number, height: number): void
  destroy(): void
}
