/**
 * Display orientation — the original CloudScope rule, applied to every image.
 *
 * Source pixels are YX (row = y, column = x). Before Viv/deck.gl draw:
 *
 * 1. Transpose the 2D plane: display width = source height, display height =
 *    source width. `display[x, y] = source[y, x]`.
 * 2. Flip-Y in the orthographic view (bottom origin). That flag is on the
 *    camera, so pixels and ROI/XY overlays flip together.
 *
 * Do not use a layer `modelMatrix` (it breaks Viv tile requests). Do not
 * rewrite OME-Zarr on disk. Viv keeps fetching native tiles; the pixel-source
 * wrapper transposes each tile after fetch.
 */

export const DISPLAY_ORIENTATION = Object.freeze({
  transpose: true,
  flipY: true,
})

export interface DisplayShape {
  width: number
  height: number
}

export interface DisplayPoint {
  x: number
  y: number
}

const TRANSPOSE_TILE = 32

/**
 * Display size after transpose: width = source height, height = source width.
 *
 * Args:
 *   sourceHeight: Source Y size (rows).
 *   sourceWidth: Source X size (columns).
 *
 * Returns:
 *   Display width and height in pixels.
 */
export function transposedShape(sourceHeight: number, sourceWidth: number): DisplayShape {
  return { width: sourceHeight, height: sourceWidth }
}

/**
 * Map source-axis calibration onto display X/Y after transpose.
 *
 * Display X is source Y; display Y is source X. Same as CloudScope-Web
 * `transposedAxes`.
 *
 * Args:
 *   xAxis: Source column axis (`dx` along source x).
 *   yAxis: Source row axis (`dy` along source y).
 *
 * Returns:
 *   Display-axis calibration used for tick labels.
 */
export function transposedAxes(
  xAxis: { label: string; unit: string; step: number },
  yAxis: { label: string; unit: string; step: number },
): {
  x: { label: string; unit: string; step: number }
  y: { label: string; unit: string; step: number }
} {
  return { x: { ...yAxis }, y: { ...xAxis } }
}

/**
 * Reorder one source-YX plane into display XY. This is the only pixel shuffle.
 *
 * Args:
 *   source: Dense row-major YX samples (`sourceHeight * sourceWidth`).
 *   sourceHeight: Source rows (Y).
 *   sourceWidth: Source columns (X).
 *
 * Returns:
 *   Display buffer with width `sourceHeight` and height `sourceWidth`.
 *
 * Raises:
 *   Error: If `source.length` is not `sourceHeight * sourceWidth`.
 */
export function transposePlane(
  source: ArrayLike<number>,
  sourceHeight: number,
  sourceWidth: number,
): Uint8Array | Uint16Array | Float32Array {
  if (source.length !== sourceHeight * sourceWidth) {
    throw new Error('source plane sample count mismatch')
  }
  const result = allocateLike(source, source.length)
  for (let rowBlock = 0; rowBlock < sourceHeight; rowBlock += TRANSPOSE_TILE) {
    const rowEnd = Math.min(sourceHeight, rowBlock + TRANSPOSE_TILE)
    for (let colBlock = 0; colBlock < sourceWidth; colBlock += TRANSPOSE_TILE) {
      const colEnd = Math.min(sourceWidth, colBlock + TRANSPOSE_TILE)
      for (let row = rowBlock; row < rowEnd; row += 1) {
        const sourceOffset = row * sourceWidth
        for (let col = colBlock; col < colEnd; col += 1) {
          result[col * sourceHeight + row] = Number(source[sourceOffset + col])
        }
      }
    }
  }
  return result
}

/**
 * Map a source pixel to display (transpose only; the view applies flip-Y).
 *
 * Source x is column, source y is row. Same geometry as CloudScope
 * `sourceToDisplay(row, col) => { x: row, y: col }`.
 *
 * Args:
 *   x: Source column.
 *   y: Source row.
 *
 * Returns:
 *   Display coordinates after swapping axes.
 */
export function sourceToDisplay(x: number, y: number): DisplayPoint {
  return { x: y, y: x }
}

/**
 * Map a display pixel back to source (x = column, y = row).
 *
 * Args:
 *   x: Display x (source row).
 *   y: Display y (source column).
 *
 * Returns:
 *   Source column and row.
 */
export function displayToSource(x: number, y: number): DisplayPoint {
  return { x: y, y: x }
}

function allocateLike(
  source: ArrayLike<number>,
  length: number,
): Uint8Array | Uint16Array | Float32Array {
  if (source instanceof Uint8Array) return new Uint8Array(length)
  if (source instanceof Uint16Array) return new Uint16Array(length)
  if (source instanceof Float32Array) return new Float32Array(length)
  if (source instanceof Int8Array) return new Uint8Array(length)
  return new Float32Array(length)
}
