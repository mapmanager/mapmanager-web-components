export const AXIS_LOCK_PIXELS = 8
export const MIN_REGION_PIXELS = 12

export type DragZoomMode = 'pending' | 'region' | 'x' | 'y'

export interface PlotPoint {
  x: number
  y: number
}

export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Classify a drag: CloudScope-Web `dragZoomMode`.
 *
 * Square display → region (forced square). Non-square → X or Y from the
 * dominant initial movement after 8 px.
 */
export function dragZoomMode(
  imageWidth: number,
  imageHeight: number,
  start: PlotPoint,
  current: PlotPoint,
): DragZoomMode {
  const deltaX = current.x - start.x
  const deltaY = current.y - start.y
  if (Math.hypot(deltaX, deltaY) < AXIS_LOCK_PIXELS) return 'pending'
  if (imageWidth === imageHeight) return 'region'
  return Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y'
}

/**
 * Rubber-band rectangle. Square images are forced to a square clamped to the plot.
 */
export function selectionRect(
  imageWidth: number,
  imageHeight: number,
  plot: { width: number; height: number },
  start: PlotPoint,
  end: PlotPoint,
): PlotRect {
  let endX = end.x
  let endY = end.y
  if (imageWidth === imageHeight) {
    const directionX = end.x < start.x ? -1 : 1
    const directionY = end.y < start.y ? -1 : 1
    const requestedSide = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
    const availableX = directionX < 0 ? start.x : plot.width - start.x
    const availableY = directionY < 0 ? start.y : plot.height - start.y
    const side = Math.min(requestedSide, availableX, availableY)
    endX = start.x + directionX * side
    endY = start.y + directionY * side
  }
  return {
    left: Math.min(start.x, endX),
    top: Math.min(start.y, endY),
    width: Math.abs(endX - start.x),
    height: Math.abs(endY - start.y),
  }
}

/** Screen guide: full-height for X-lock, full-width for Y-lock, else the selection. */
export function guideRect(
  mode: DragZoomMode,
  selection: PlotRect,
  plot: { width: number; height: number },
): PlotRect | null {
  if (mode === 'pending') return null
  if (mode === 'x') {
    return { left: selection.left, top: 0, width: selection.width, height: plot.height }
  }
  if (mode === 'y') {
    return { left: 0, top: selection.top, width: plot.width, height: selection.height }
  }
  return selection
}
