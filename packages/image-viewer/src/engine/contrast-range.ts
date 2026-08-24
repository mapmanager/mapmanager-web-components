/** Display-range helpers. Port of CloudScope-Web `contrast-range.js` math. */

const HISTOGRAM_BINS = 96
const MAX_SAMPLES = 120_000

export interface Histogram {
  bins: Uint32Array
  domainMin: number
  domainMax: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function sampledFiniteValues(values: ArrayLike<number>, maxSamples = MAX_SAMPLES): number[] {
  const samples: number[] = []
  const step = Math.max(1, Math.floor(values.length / maxSamples))
  for (let index = 0; index < values.length; index += step) {
    const value = Number(values[index])
    if (Number.isFinite(value)) samples.push(value)
  }
  return samples
}

function percentile(sortedValues: number[], percent: number): number {
  if (sortedValues.length === 0) return Number.NaN
  const index = clamp(
    Math.round((percent / 100) * (sortedValues.length - 1)),
    0,
    sortedValues.length - 1,
  )
  return sortedValues[index] ?? Number.NaN
}

/**
 * 1st–99.5th percentile display range from plane samples.
 *
 * Args:
 *   values: Intensity samples (may be a full plane or a stride sample).
 *
 * Returns:
 *   `[min, max]` suitable for Viv contrastLimits.
 */
export function autoRange(values: ArrayLike<number>): [number, number] {
  const sorted = sampledFiniteValues(values).sort((left, right) => left - right)
  let minimum = percentile(sorted, 1)
  let maximum = percentile(sorted, 99.5)
  if (!(maximum > minimum)) {
    const center = Number.isFinite(minimum) ? minimum : 0
    const delta = Math.max(1e-9, Math.abs(center) * 0.01 || 1)
    minimum = center - delta
    maximum = center + delta
  }
  return [minimum, maximum]
}

/**
 * Binned histogram for the contrast popover.
 *
 * Args:
 *   values: Intensity samples.
 *   binCount: Number of bars.
 *
 * Returns:
 *   Bins and domain, or `null` when there are no finite samples.
 */
export function histogramForValues(values: ArrayLike<number>, binCount = HISTOGRAM_BINS): Histogram | null {
  const sorted = sampledFiniteValues(values).sort((left, right) => left - right)
  if (sorted.length === 0) return null
  let domainMin = percentile(sorted, 0.1)
  let domainMax = percentile(sorted, 99.9)
  if (!(domainMax > domainMin)) {
    const delta = Math.max(1e-9, Math.abs(domainMin) * 0.01 || 1)
    domainMin -= delta
    domainMax += delta
  }
  const bins = new Uint32Array(binCount)
  const span = domainMax - domainMin
  for (const value of sorted) {
    const index = clamp(Math.floor(((value - domainMin) / span) * binCount), 0, binCount - 1)
    bins[index] = (bins[index] ?? 0) + 1
  }
  return { bins, domainMin, domainMax }
}

/**
 * Normalize a bin count to a bar height fraction.
 *
 * Args:
 *   count: Bin count (non-negative).
 *   maxCount: Maximum bin count in the histogram.
 *   logScale: When true, use log1p scaling; otherwise linear.
 *
 * Returns:
 *   Fraction in `[0, 1]`.
 */
export function histogramBarFraction(count: number, maxCount: number, logScale = true): number {
  const peak = Math.max(1, Number(maxCount) || 0)
  const value = Math.max(0, Number(count) || 0)
  if (logScale) return Math.log1p(value) / Math.log1p(peak)
  return value / peak
}

export function numberText(value: number): string {
  const magnitude = Math.abs(value)
  if ((magnitude !== 0 && magnitude < 0.001) || magnitude >= 100000) {
    return value.toExponential(5)
  }
  return String(Number(value.toPrecision(8)))
}
