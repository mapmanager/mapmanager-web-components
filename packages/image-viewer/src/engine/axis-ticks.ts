/**
 * Canvas axis chrome defaults (font, tick density, gutters).
 *
 * Port of CloudScope-Web `viewport.js` `DEFAULT_AXIS_STYLE`. Gutters are CSS
 * pixels reserved around the Deck plot so ticks sit off the image.
 */
export const DEFAULT_AXIS_STYLE = Object.freeze({
  fontSize: 11,
  fontFamily: '"Open Sans", verdana, arial, sans-serif',
  tickCount: 5,
  tickLength: 5,
  tickLabelOffsetX: 7,
  tickLabelOffsetY: 8,
  margins: Object.freeze({ left: 64, right: 20, top: 10, bottom: 40 }),
})

export type AxisMargins = {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Choose a 1/2/5×10ⁿ step aiming for about `tickCount` ticks in `[min, max]`.
 *
 * Args:
 *   min: Inclusive range minimum (physical units).
 *   max: Inclusive range maximum (physical units).
 *   tickCount: Target tick count (intervals = tickCount - 1).
 *
 * Returns:
 *   Nice step, or `null` when the range is not usable.
 */
export function niceStep(min: number, max: number, tickCount = 5): number | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null
  const target = Math.max(2, Math.round(Number(tickCount) || 5))
  const rough = (max - min) / (target - 1)
  if (!(rough > 0) || !Number.isFinite(rough)) return null
  const exponent = Math.floor(Math.log10(rough))
  const magnitude = 10 ** exponent
  const fraction = rough / magnitude
  let niceFraction: number
  if (fraction < 1.5) niceFraction = 1
  else if (fraction < 3) niceFraction = 2
  else if (fraction < 7) niceFraction = 5
  else niceFraction = 10
  return niceFraction * magnitude
}

/**
 * Return nice tick values inside `[min, max]`.
 *
 * Args:
 *   min: Inclusive range minimum (physical units).
 *   max: Inclusive range maximum (physical units).
 *   tickCount: Target tick count for step selection.
 *
 * Returns:
 *   Increasing tick positions in physical units.
 */
export function niceTickValues(min: number, max: number, tickCount = 5): number[] {
  const step = niceStep(min, max, tickCount)
  if (step == null) return []
  const start = Math.ceil(min / step - 1e-12) * step
  const ticks: number[] = []
  const maxTicks = Math.max(2, Math.round(Number(tickCount) || 5)) * 4
  for (let index = 0; index < maxTicks; index += 1) {
    const raw = (Math.round(start / step) + index) * step
    const tick = Number(raw.toPrecision(15))
    if (tick > max + step * 1e-10) break
    if (tick >= min - step * 1e-10) ticks.push(tick)
  }
  return ticks
}

/**
 * Format a physical tick value for axis labels.
 *
 * Args:
 *   value: Physical tick value.
 *   step: Nice step used to place the tick, when known.
 *
 * Returns:
 *   Display label.
 */
export function formatTick(value: number, step: number | null = null): string {
  if (!Number.isFinite(value)) return ''
  const magnitude = Math.abs(value)
  if (magnitude > 0 && (magnitude < 0.001 || magnitude >= 10000)) {
    return value.toExponential(2)
  }
  if (step != null && Number.isFinite(step) && step > 0) {
    if (step >= 1) return String(Math.round(value))
    const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step) - 1e-12)))
    return String(Number(value.toFixed(decimals)))
  }
  return String(Number(value.toPrecision(5)))
}

export interface AxisDrawInput {
  plot: { left: number; top: number; width: number; height: number }
  canvasHeight: number
  /** Physical value at the left edge of the plot (follows the image). */
  xLeft: number
  /** Physical value at the right edge of the plot. */
  xRight: number
  /** Physical value at the bottom edge of the plot (screen bottom). */
  yBottom: number
  /** Physical value at the top edge of the plot (screen top). */
  yTop: number
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
}

/**
 * Map a physical axis value to a plot-canvas X.
 *
 * Interpolates between the world values at the left and right edges so ticks
 * stay glued to the image when those edges are not min→max left→right.
 */
export function physicalToPlotX(
  value: number,
  xLeft: number,
  xRight: number,
  plot: { left: number; width: number },
): number {
  const span = xRight - xLeft
  if (span === 0) return plot.left + plot.width / 2
  return plot.left + ((value - xLeft) / span) * plot.width
}

/**
 * Map a physical axis value to a plot-canvas Y.
 *
 * `yBottom` / `yTop` are the world values at the **screen** bottom and top.
 * Value equal to `yBottom` sits on the bottom edge so 0 is at the bottom
 * when that edge’s world-Y is 0.
 */
export function physicalToPlotY(
  value: number,
  yBottom: number,
  yTop: number,
  plot: { top: number; height: number },
): number {
  const span = yTop - yBottom
  if (span === 0) return plot.top + plot.height / 2
  const fraction = (value - yBottom) / span
  return plot.top + plot.height - fraction * plot.height
}

/**
 * Y plot edges for deck.gl `flipY` (view matrix Y scale is -1).
 *
 * `visibleDisplayRect` is not flip-aware, so a pan that moves the image up
 * would move ticks down if we used `y0` at the bottom. Reflecting through
 * display height keeps 0 at the bottom at home and reverses pan to follow
 * the image.
 */
export function flipYPlotEdges(
  viewY0: number,
  viewY1: number,
  displayHeight: number,
): { yBottom: number; yTop: number } {
  return {
    yBottom: displayHeight - viewY1,
    yTop: displayHeight - viewY0,
  }
}

export type PlotBox = { left: number; top: number; width: number; height: number }

export type VisibleImageAxis = {
  plot: PlotBox
  xLeft: number
  xRight: number
  yBottom: number
  yTop: number
}

function clampPhysical(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max)
}

/**
 * Axis box and physical edges for the visible image ∩ Deck stage.
 *
 * The box hugs the raster inside the stage (letterboxed when zoomed out). Tick
 * values stay in `[0, (n-1)·step]`, matching `viewWindow()`. Returns `null`
 * when the image is fully off-plot.
 *
 * Args:
 *   plot: Deck stage rectangle in overlay-canvas CSS pixels.
 *   view: Camera window in display pixels (`visibleDisplayRect`).
 *   imageWidth: Display image width in samples.
 *   imageHeight: Display image height in samples.
 *   xStep: Physical units per display-X sample.
 *   yStep: Physical units per display-Y sample.
 *
 * Returns:
 *   Inset axis rect and clamped physical edges, or `null` when empty.
 */
export function visibleImageAxis(input: {
  plot: PlotBox
  view: { x0: number; y0: number; x1: number; y1: number }
  imageWidth: number
  imageHeight: number
  xStep: number
  yStep: number
}): VisibleImageAxis | null {
  const { plot, view, imageWidth, imageHeight, xStep, yStep } = input
  if (!(plot.width > 0) || !(plot.height > 0)) return null
  if (!(imageWidth > 0) || !(imageHeight > 0)) return null
  if (view.x1 === view.x0 || view.y1 === view.y0) return null

  const ix0 = Math.max(view.x0, 0)
  const ix1 = Math.min(view.x1, imageWidth)
  if (!(ix1 > ix0)) return null

  const yCam = flipYPlotEdges(view.y0, view.y1, imageHeight)
  const iyBottom = Math.max(Math.min(yCam.yBottom, yCam.yTop), 0)
  const iyTop = Math.min(Math.max(yCam.yBottom, yCam.yTop), imageHeight)
  if (!(iyTop > iyBottom)) return null

  const left = physicalToPlotX(ix0, view.x0, view.x1, plot)
  const right = physicalToPlotX(ix1, view.x0, view.x1, plot)
  const top = physicalToPlotY(iyTop, yCam.yBottom, yCam.yTop, plot)
  const bottom = physicalToPlotY(iyBottom, yCam.yBottom, yCam.yTop, plot)
  const axisLeft = Math.min(left, right)
  const axisRight = Math.max(left, right)
  const axisTop = Math.min(top, bottom)
  const axisBottom = Math.max(top, bottom)
  const width = axisRight - axisLeft
  const height = axisBottom - axisTop
  if (!(width > 0) || !(height > 0)) return null

  const xMax = Math.max(0, (imageWidth - 1) * xStep)
  const yMax = Math.max(0, (imageHeight - 1) * yStep)
  return {
    plot: { left: axisLeft, top: axisTop, width, height },
    xLeft: clampPhysical(ix0 * xStep, xMax),
    xRight: clampPhysical(ix1 * xStep, xMax),
    yBottom: clampPhysical(iyBottom * yStep, yMax),
    yTop: clampPhysical(iyTop * yStep, yMax),
  }
}

/**
 * Stroke the axis box, nice ticks, and titles. Tick numbers are physical units
 * (`pixelIndex * step`). Labels/units are caller-provided.
 *
 * `plot` is the visible-image rectangle (image ∩ Deck stage). Titles center on
 * that box; the X title stays in the bottom gutter (`canvasHeight`).
 */
export function drawAxes(
  context: CanvasRenderingContext2D,
  input: AxisDrawInput,
  style: typeof DEFAULT_AXIS_STYLE = DEFAULT_AXIS_STYLE,
): void {
  const { plot } = input
  if (!(plot.width > 0) || !(plot.height > 0)) return
  const xMin = Math.min(input.xLeft, input.xRight)
  const xMax = Math.max(input.xLeft, input.xRight)
  const yMin = Math.min(input.yBottom, input.yTop)
  const yMax = Math.max(input.yBottom, input.yTop)
  const xStep = niceStep(xMin, xMax, style.tickCount)
  const yStep = niceStep(yMin, yMax, style.tickCount)
  const xTicks = niceTickValues(xMin, xMax, style.tickCount)
  const yTicks = niceTickValues(yMin, yMax, style.tickCount)
  context.save()
  context.strokeStyle = '#64748b'
  context.fillStyle = '#cbd5e1'
  context.lineWidth = 2
  context.font = `${style.fontSize}px ${style.fontFamily}`
  context.strokeRect(plot.left + 0.5, plot.top + 0.5, Math.max(0, plot.width - 1), Math.max(0, plot.height - 1))
  if (input.xRight !== input.xLeft) {
    for (const value of xTicks) {
      const x = physicalToPlotX(value, input.xLeft, input.xRight, plot)
      context.beginPath()
      context.moveTo(x, plot.top + plot.height)
      context.lineTo(x, plot.top + plot.height + style.tickLength)
      context.stroke()
      context.textAlign = 'center'
      context.textBaseline = 'top'
      context.fillText(formatTick(value, xStep), x, plot.top + plot.height + style.tickLabelOffsetX)
    }
  }
  if (input.yTop !== input.yBottom) {
    for (const value of yTicks) {
      const y = physicalToPlotY(value, input.yBottom, input.yTop, plot)
      context.beginPath()
      context.moveTo(plot.left - style.tickLength, y)
      context.lineTo(plot.left, y)
      context.stroke()
      context.textAlign = 'right'
      context.textBaseline = 'middle'
      context.fillText(formatTick(value, yStep), plot.left - style.tickLabelOffsetY, y)
    }
  }
  const xUnit = input.xUnit ? ` (${input.xUnit})` : ''
  const yUnit = input.yUnit ? ` (${input.yUnit})` : ''
  context.textAlign = 'center'
  context.textBaseline = 'bottom'
  context.fillText(`${input.xLabel}${xUnit}`, plot.left + plot.width / 2, input.canvasHeight - 1)
  context.save()
  context.translate(10, plot.top + plot.height / 2)
  context.rotate(-Math.PI / 2)
  context.fillText(`${input.yLabel}${yUnit}`, 0, 0)
  context.restore()
  context.restore()
}
