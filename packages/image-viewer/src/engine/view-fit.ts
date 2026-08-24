/**
 * Home view: CloudScope-Web `viewport.fit` in deck.gl zoom space.
 *
 * Compare **display** width and height (after orientation), not source YX.
 * Square images (`width === height`): one scale, contain, 0.98 inset.
 * Non-square: independent X/Y scales so the plane fills the view (rectangular
 * pixels allowed).
 */

export type HomeZoom = number | [number, number]

export type OrthographicViewState = {
  target: [number, number, number]
  zoom: HomeZoom
  minZoom: number
  maxZoom: number
}

export function zoomAxes(zoom: HomeZoom): { x: number; y: number } {
  if (Array.isArray(zoom)) return { x: zoom[0], y: zoom[1] }
  return { x: zoom, y: zoom }
}

/**
 * Visible display rectangle for a deck.gl OrthographicView.
 *
 * Zoom 0 is 1:1. Scale is `2 ** zoom` (deck.gl OrthographicView).
 * `target` is the world point at the viewport center.
 */
export function visibleDisplayRect(
  viewWidth: number,
  viewHeight: number,
  target: readonly [number, number, number],
  zoom: HomeZoom,
): { x0: number; y0: number; x1: number; y1: number } {
  const axes = zoomAxes(zoom)
  const halfW = Math.max(viewWidth, 1) / (2 * 2 ** axes.x)
  const halfH = Math.max(viewHeight, 1) / (2 * 2 ** axes.y)
  return {
    x0: target[0] - halfW,
    y0: target[1] - halfH,
    x1: target[0] + halfW,
    y1: target[1] + halfH,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Centered rectangle covering `fraction` of the visible window, clipped to the image. */
export function defaultRectDisplay(
  view: { x0: number; y0: number; x1: number; y1: number },
  imageWidth: number,
  imageHeight: number,
  fraction = 0.4,
): { x0: number; y0: number; x1: number; y1: number } {
  const width = Math.max((view.x1 - view.x0) * fraction, 1)
  const height = Math.max((view.y1 - view.y0) * fraction, 1)
  const cx = (view.x0 + view.x1) / 2
  const cy = (view.y0 + view.y1) / 2
  const x0 = clamp(cx - width / 2, 0, Math.max(imageWidth - 1, 0))
  const y0 = clamp(cy - height / 2, 0, Math.max(imageHeight - 1, 0))
  const x1 = clamp(cx + width / 2, x0 + 1, imageWidth)
  const y1 = clamp(cy + height / 2, y0 + 1, imageHeight)
  return { x0, y0, x1, y1 }
}

/** Horizontal line covering 60% of the visible width, clipped to the image. */
export function defaultLineDisplay(
  view: { x0: number; y0: number; x1: number; y1: number },
  imageWidth: number,
  imageHeight: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const width = Math.max((view.x1 - view.x0) * 0.6, 1)
  const cx = (view.x0 + view.x1) / 2
  const cy = clamp((view.y0 + view.y1) / 2, 0, Math.max(imageHeight - 1, 0))
  const x0 = clamp(cx - width / 2, 0, Math.max(imageWidth - 1, 0))
  const x1 = clamp(cx + width / 2, x0 + 1, imageWidth)
  return { x0, y0: cy, x1, y1: cy }
}

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
