import uPlot from 'uplot'

import type {
  LoadedSignalFrame,
  MinMaxSeriesResult,
  SampleSeriesResult,
  SignalDescription,
  SignalOverlayPoint,
  SignalOverlays,
  SignalSeriesResult,
  SignalViewport,
} from '../../core'
import type { SignalRenderer, SignalRendererCallbacks } from '../renderer-api'

interface HitPoint {
  id: string
  left: number
  top: number
}

/** uPlot adapter. Storage, range loading, and application state stay outside. */
export class UPlotSignalRenderer implements SignalRenderer {
  #host: HTMLElement
  #callbacks: SignalRendererCallbacks
  #plot: uPlot | null = null
  #description: SignalDescription | null = null
  #frame: LoadedSignalFrame | null = null
  #overlays: SignalOverlays = { points: [] }
  #internalUpdate = false
  #hitPoints: HitPoint[] = []
  #width = 640
  #height = 300

  constructor(host: HTMLElement, callbacks: SignalRendererCallbacks) {
    this.#host = host
    this.#callbacks = callbacks
  }

  setDescription(description: SignalDescription): void {
    this.#description = description
    this.#rebuild()
  }

  setFrame(frame: LoadedSignalFrame): void {
    if (!this.#description || this.#description.id !== frame.description.id) {
      this.setDescription(frame.description)
    }
    this.#frame = frame
    const plot = this.#plot
    if (!plot) return
    const data = alignedData(frame)
    const yRange = frameYRange(frame)
    this.#internalUpdate = true
    try {
      plot.batch(() => {
        plot.setData(data, false)
        plot.setScale('x', {
          min: frame.requestedViewport.xMin,
          max: frame.requestedViewport.xMax,
        })
        plot.setScale('y', yRange)
      })
    } finally {
      this.#internalUpdate = false
    }
    plot.redraw()
  }

  setOverlays(overlays: SignalOverlays): void {
    this.#overlays = {
      points: overlays.points.map((point) => ({ ...point })),
      ...(overlays.regions ? { regions: overlays.regions.map((region) => ({ ...region })) } : {}),
      ...(overlays.selectedPointId !== undefined
        ? { selectedPointId: overlays.selectedPointId }
        : {}),
    }
    this.#plot?.redraw(false, false)
  }

  setViewport(viewport: SignalViewport): void {
    if (!this.#plot) return
    this.#internalUpdate = true
    try {
      this.#plot.setScale('x', { min: viewport.xMin, max: viewport.xMax })
    } finally {
      this.#internalUpdate = false
    }
  }

  resize(width: number, height: number): void {
    const nextWidth = Math.max(120, Math.floor(width))
    const nextHeight = Math.max(100, Math.floor(height))
    if (nextWidth === this.#width && nextHeight === this.#height) return
    this.#width = nextWidth
    this.#height = nextHeight
    this.#plot?.setSize({ width: nextWidth, height: nextHeight })
  }

  destroy(): void {
    this.#plot?.destroy()
    this.#plot = null
    this.#host.replaceChildren()
  }

  #rebuild(): void {
    this.#plot?.destroy()
    this.#host.replaceChildren()
    const description = this.#description
    if (!description) return
    const options: uPlot.Options = {
      width: this.#width,
      height: this.#height,
      legend: { show: description.series.length > 1 },
      cursor: { drag: { x: true, y: false, setScale: true } },
      scales: { x: { time: false }, y: { auto: false } },
      axes: [
        { label: axisLabel(description.xLabel, description.xUnit) },
        { label: axisLabel(description.yLabel, description.yUnit) },
      ],
      series: [
        {},
        ...description.series.map((series) => ({
          label: series.label,
          stroke: series.color,
          paths: () => null,
          points: { show: false },
        })),
      ],
      hooks: {
        setScale: [(_plot, key) => this.#onScale(key)],
        draw: [(plot) => this.#draw(plot)],
        ready: [(plot) => plot.over.addEventListener('click', this.#onClick)],
      },
    }
    this.#plot = new uPlot(options, emptyData(description.series.length), this.#host)
    if (this.#frame) this.setFrame(this.#frame)
  }

  #onScale(key: string): void {
    if (this.#internalUpdate || key !== 'x' || !this.#plot) return
    const scale = this.#plot.scales['x']
    if (!scale) return
    const { min, max } = scale
    if (min == null || max == null) return
    this.#callbacks.viewportChange({ xMin: min, xMax: max })
  }

  #draw(plot: uPlot): void {
    const frame = this.#frame
    if (!frame) return
    const { ctx } = plot
    ctx.save()
    ctx.beginPath()
    ctx.rect(plot.bbox.left, plot.bbox.top, plot.bbox.width, plot.bbox.height)
    ctx.clip()
    this.#drawRegions(plot)
    frame.result.series.forEach((series, index) => {
      const color = frame.description.series[index]?.color ?? '#38bdf8'
      if (series.kind === 'samples') this.#drawSamples(plot, frame, series, color)
      else this.#drawMinMax(plot, frame, series, color)
    })
    this.#drawPoints(plot)
    ctx.restore()
  }

  #drawSamples(
    plot: uPlot,
    frame: LoadedSignalFrame,
    series: SampleSeriesResult,
    color: string,
  ): void {
    const { ctx } = plot
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = devicePixelRatio
    for (let index = 0; index < series.values.length; index += 1) {
      const x = sampleX(frame, frame.result.startSample + index)
      const y = series.values[index]
      if (y === undefined || !Number.isFinite(y)) continue
      const left = plot.valToPos(x, 'x', true)
      const top = plot.valToPos(y, 'y', true)
      if (index === 0) ctx.moveTo(left, top)
      else ctx.lineTo(left, top)
    }
    ctx.stroke()
  }

  #drawMinMax(
    plot: uPlot,
    frame: LoadedSignalFrame,
    series: MinMaxSeriesResult,
    color: string,
  ): void {
    const { ctx } = plot
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = devicePixelRatio
    for (let index = 0; index < series.minimum.length; index += 1) {
      const sample = frame.result.startSample + index * series.factor + series.factor / 2
      const low = series.minimum[index]
      const high = series.maximum[index]
      if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) continue
      const left = plot.valToPos(sampleX(frame, sample), 'x', true)
      ctx.moveTo(left, plot.valToPos(low, 'y', true))
      ctx.lineTo(left, plot.valToPos(high, 'y', true))
    }
    ctx.stroke()
  }

  #drawRegions(plot: uPlot): void {
    const { ctx } = plot
    for (const region of this.#overlays.regions ?? []) {
      const left = plot.valToPos(region.xStart, 'x', true)
      const right = plot.valToPos(region.xStop, 'x', true)
      ctx.fillStyle = region.color ?? 'rgba(148, 163, 184, 0.12)'
      ctx.fillRect(left, plot.bbox.top, right - left, plot.bbox.height)
    }
  }

  #drawPoints(plot: uPlot): void {
    const { ctx } = plot
    this.#hitPoints = []
    for (const point of this.#overlays.points) {
      if (!visiblePoint(plot, point)) continue
      const left = plot.valToPos(point.x, 'x', true)
      const top = plot.valToPos(point.y, 'y', true)
      const selected = point.id === this.#overlays.selectedPointId
      const radius = (selected ? 5 : 3.5) * devicePixelRatio
      ctx.beginPath()
      ctx.arc(left, top, radius, 0, Math.PI * 2)
      ctx.fillStyle = point.color ?? '#f97316'
      ctx.fill()
      if (selected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2 * devicePixelRatio
        ctx.stroke()
      }
      this.#hitPoints.push({
        id: point.id,
        left: plot.valToPos(point.x, 'x', false),
        top: plot.valToPos(point.y, 'y', false),
      })
    }
  }

  #onClick = (event: MouseEvent): void => {
    const plot = this.#plot
    if (!plot) return
    const rect = plot.over.getBoundingClientRect()
    const left = event.clientX - rect.left
    const top = event.clientY - rect.top
    let closest: HitPoint | null = null
    let distance = 9
    for (const point of this.#hitPoints) {
      const next = Math.hypot(point.left - left, point.top - top)
      if (next <= distance) {
        distance = next
        closest = point
      }
    }
    this.#callbacks.overlaySelect(closest?.id ?? null)
  }
}

function emptyData(seriesCount: number): uPlot.AlignedData {
  return Array.from({ length: seriesCount + 1 }, () => [] as number[]) as unknown as uPlot.AlignedData
}

function alignedData(frame: LoadedSignalFrame): uPlot.AlignedData {
  const first = frame.result.series[0]
  if (!first) throw new Error('signal frame contains no series')
  const length = resultLength(first)
  for (const series of frame.result.series) {
    if (series.kind !== first.kind || resultLength(series) !== length) {
      throw new Error('all signal series in one track must use the same range representation')
    }
    if (series.kind === 'minmax' && first.kind === 'minmax' && series.factor !== first.factor) {
      throw new Error('all min/max series in one track must use the same factor')
    }
  }
  const factor = first.kind === 'minmax' ? first.factor : 1
  const x = Array.from({ length }, (_, index) =>
    sampleX(frame, frame.result.startSample + index * factor + (factor === 1 ? 0 : factor / 2)),
  )
  const values = frame.result.series.map((series) =>
    series.kind === 'samples'
      ? Array.from(series.values)
      : Array.from(series.minimum, (low, index) => (low + (series.maximum[index] ?? low)) / 2),
  )
  return [x, ...values] as uPlot.AlignedData
}

function frameYRange(frame: LoadedSignalFrame): { min: number; max: number } {
  let minimum = Infinity
  let maximum = -Infinity
  for (const series of frame.result.series) {
    const arrays = series.kind === 'samples' ? [series.values] : [series.minimum, series.maximum]
    for (const values of arrays) {
      for (const value of values) {
        if (Number.isFinite(value)) {
          minimum = Math.min(minimum, value)
          maximum = Math.max(maximum, value)
        }
      }
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return { min: -1, max: 1 }
  const padding = Math.max((maximum - minimum) * 0.05, Math.abs(maximum) * 0.01, 1e-9)
  return { min: minimum - padding, max: maximum + padding }
}

function resultLength(series: SignalSeriesResult): number {
  return series.kind === 'samples' ? series.values.length : series.minimum.length
}

function sampleX(frame: LoadedSignalFrame, sample: number): number {
  return frame.description.xStart + sample * frame.description.xStep
}

function axisLabel(label: string, unit: string): string {
  return unit ? `${label} (${unit})` : label
}

function visiblePoint(plot: uPlot, point: SignalOverlayPoint): boolean {
  const x = plot.scales['x']
  const y = plot.scales['y']
  return x != null && y != null && x.min != null && x.max != null && y.min != null && y.max != null &&
    point.x >= x.min && point.x <= x.max && point.y >= y.min && point.y <= y.max
}
