import type { SignalAxisRange } from '../../core'

/** Translate a range by a fraction of its current span. */
export function translateRange(range: SignalAxisRange, fraction: number): SignalAxisRange {
  const offset = (range.max - range.min) * fraction
  return { min: range.min + offset, max: range.max + offset }
}

/** Keep a translated range inside fixed bounds without changing its span. */
export function clampRange(range: SignalAxisRange, bounds: SignalAxisRange): SignalAxisRange {
  const span = range.max - range.min
  if (span >= bounds.max - bounds.min) return { ...bounds }
  if (range.min < bounds.min) return { min: bounds.min, max: bounds.min + span }
  if (range.max > bounds.max) return { min: bounds.max - span, max: bounds.max }
  return range
}
