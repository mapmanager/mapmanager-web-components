import { ImageViewerElement } from './ImageViewerElement'

/** Register `<mapmanager-image-viewer>` once per document. */
export function registerImageViewerElement(tagName = 'mapmanager-image-viewer'): void {
  if (!customElements.get(tagName)) customElements.define(tagName, ImageViewerElement)
}
