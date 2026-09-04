import type { ResolvedSignalTraceStyle, SignalTraceStyle } from './types'

const TRACE_COLORS = ['#38bdf8', '#f97316', '#a855f7', '#22c55e', '#ef4444'] as const

/** Default trace visuals used when a caller omits style fields. */
export const DEFAULT_TRACE_STYLE: Readonly<Omit<ResolvedSignalTraceStyle, 'color'>> = {
  lineWidth: 2,
  markers: false,
  markerSize: 4,
}

/** Resolve sparse caller style options into renderer-ready values. */
export function resolveTraceStyle(
  style: SignalTraceStyle | undefined,
  seriesIndex: number,
): ResolvedSignalTraceStyle {
  const lineWidth = style?.lineWidth ?? DEFAULT_TRACE_STYLE.lineWidth
  const markerSize = style?.markerSize ?? DEFAULT_TRACE_STYLE.markerSize
  if (!(lineWidth > 0) || !(markerSize > 0)) {
    throw new Error('trace lineWidth and markerSize must be positive')
  }
  return {
    color: style?.color ?? TRACE_COLORS[seriesIndex % TRACE_COLORS.length] ?? '#38bdf8',
    lineWidth,
    markers: style?.markers ?? DEFAULT_TRACE_STYLE.markers,
    markerSize,
  }
}
