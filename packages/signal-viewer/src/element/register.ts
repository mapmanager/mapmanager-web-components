import { SignalViewerElement } from './SignalViewerElement'

export function registerSignalViewerElement(tagName = 'mm-signal-viewer'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, SignalViewerElement)
}
