/**
 * Home view: CloudScope-Web `viewport.fit` in deck.gl zoom space.
 *
 * Compare **display** width and height (after orientation), not source YX.
 * Square images (`width === height`): one scale, contain, 0.98 inset.
 * Non-square: independent X/Y scales so the plane fills the view (rectangular
 * pixels allowed).
 */

export type HomeZoom = number | [number, number]

/**
 * Deck.gl Orthographic zoom for home/fit.
 *
 * Args:
 *   viewWidth: Viewport width in CSS pixels.
 *   viewHeight: Viewport height in CSS pixels.
 *   imageWidth: Display image width in samples (after transpose).
 *   imageHeight: Display image height in samples (after transpose).
 *
 * Returns:
 *   One zoom if the image is square; `[zoomX, zoomY]` otherwise.
 */
export function homeZoom(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
): HomeZoom {
  const viewW = Math.max(viewWidth, 1)
  const viewH = Math.max(viewHeight, 1)
  const imageW = Math.max(imageWidth, 1)
  const imageH = Math.max(imageHeight, 1)
  if (imageW === imageH) {
    const scale = Math.min(viewW / imageW, viewH / imageH) * 0.98
    return Math.log2(scale)
  }
  return [Math.log2(viewW / imageW), Math.log2(viewH / imageH)]
}
