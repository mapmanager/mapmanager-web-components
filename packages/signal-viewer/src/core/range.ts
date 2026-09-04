import type { SignalDescription, SignalRangeResult, SignalViewport } from './types'

/** Return the complete calibrated X range. */
export function fullViewport(description: SignalDescription): SignalViewport {
  return {
    xMin: description.xStart,
    xMax: description.xStart + Math.max(description.sampleCount - 1, 0) * description.xStep,
  }
}

/** Clamp and order a calibrated viewport, falling back to the full range. */
export function normalizeViewport(
  description: SignalDescription,
  viewport: SignalViewport,
): SignalViewport {
  const full = fullViewport(description)
  const low = Math.max(full.xMin, Math.min(viewport.xMin, viewport.xMax))
  const high = Math.min(full.xMax, Math.max(viewport.xMin, viewport.xMax))
  if (high <= low) return full
  return { xMin: low, xMax: high }
}

/** Convert a calibrated viewport to an overscanned half-open sample range. */
export function viewportSamples(
  description: SignalDescription,
  viewport: SignalViewport,
  overscanFraction = 0.15,
): { startSample: number; stopSample: number } {
  const normalized = normalizeViewport(description, viewport)
  const first = Math.floor((normalized.xMin - description.xStart) / description.xStep)
  const lastInclusive = Math.ceil((normalized.xMax - description.xStart) / description.xStep)
  const visibleCount = Math.max(lastInclusive - first + 1, 1)
  const overscan = Math.ceil(visibleCount * overscanFraction)
  return {
    startSample: Math.max(0, first - overscan),
    stopSample: Math.min(description.sampleCount, lastInclusive + 1 + overscan),
  }
}

/** Validate source metadata before it reaches a renderer. */
export function validateDescription(description: SignalDescription): void {
  if (!description.id) throw new Error('signal description requires an id')
  if (!Number.isInteger(description.sampleCount) || description.sampleCount < 2) {
    throw new Error('signal sampleCount must be an integer >= 2')
  }
  if (!Number.isFinite(description.xStart) || !(description.xStep > 0)) {
    throw new Error('signal xStart must be finite and xStep must be positive')
  }
  if (description.series.length === 0) throw new Error('signal requires at least one series')
  const ids = description.series.map(({ id }) => id)
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('signal series ids must be non-empty and unique')
  }
  if (description.series.some((series) => series.yAxis === 'right') && !description.yAxes.right) {
    throw new Error('right-axis series require right-axis configuration')
  }
  for (const axis of [description.yAxes.left, description.yAxes.right]) {
    if (axis?.range !== undefined && axis.range !== 'auto') {
      if (!Number.isFinite(axis.range.min) || !Number.isFinite(axis.range.max) || axis.range.max <= axis.range.min) {
        throw new Error('explicit Y-axis ranges require finite min < max')
      }
    }
  }
}

/** Validate source range output against its description and requested IDs. */
export function validateRangeResult(
  description: SignalDescription,
  result: SignalRangeResult,
  expectedIds: readonly string[],
): void {
  if (
    !Number.isInteger(result.startSample) ||
    !Number.isInteger(result.stopSample) ||
    result.startSample < 0 ||
    result.stopSample <= result.startSample ||
    result.stopSample > description.sampleCount
  ) {
    throw new Error('signal source returned an invalid sample range')
  }
  const resultsById = new Map(result.series.map((series) => [series.id, series]))
  for (const id of expectedIds) {
    const series = resultsById.get(id)
    if (!series) throw new Error(`signal source omitted requested series: ${id}`)
    const length = series.kind === 'samples' ? series.values.length : series.minimum.length
    if (series.kind === 'samples' && length !== result.stopSample - result.startSample) {
      throw new Error(`sample series ${id} has the wrong length`)
    }
    if (
      series.kind === 'minmax' &&
      (!(series.factor > 1) || series.maximum.length !== length || length === 0)
    ) {
      throw new Error(`min/max series ${id} is invalid`)
    }
  }
}
