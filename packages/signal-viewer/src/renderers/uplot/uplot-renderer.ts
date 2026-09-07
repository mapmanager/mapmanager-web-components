import uPlot from 'uplot'

import {
  cloneCursorState,
  cursorChange,
  defaultCursorState,
  resolveTraceStyle,
  SIGNAL_VIEWER_THEMES,
  type LoadedSignalFrame,
  type MinMaxSeriesResult,
  type SampleSeriesResult,
  type SignalAxisRange,
  type SignalAxisRangeSetting,
  type SignalAxisId,
  type SignalCursorId,
  type SignalCursorState,
  type SignalDescription,
  type SignalOverlayPoint,
  type SignalOverlays,
  type SignalSeriesResult,
  type SignalViewport,
  type SignalViewerTheme,
  type SignalYAxisId,
} from '../../core'
import type { SignalViewerThemeTokens } from '../../core/theme'
import type { SignalFrameOptions, SignalRenderer, SignalRendererCallbacks } from '../renderer-api'
import { clampRange, translateRange, zoomRange } from './pan'

interface HitPoint { id: string; left: number; top: number }
interface PanState {
  left: number
  top: number
  x: SignalAxisRange
  leftY: SignalAxisRange
  rightY: SignalAxisRange | null
  moved: boolean
}

/** uPlot adapter. Sources, session state, and application policy stay outside. */
export class UPlotSignalRenderer implements SignalRenderer {
  #host: HTMLElement
  #callbacks: SignalRendererCallbacks
  #plot: uPlot | null = null
  #description: SignalDescription | null = null
  #frame: LoadedSignalFrame | null = null
  #overlays: SignalOverlays = { scatterSeries: [] }
  #cursors = defaultCursorState()
  #axisSettings: Record<SignalYAxisId, SignalAxisRangeSetting> = { left: 'auto', right: 'auto' }
  #axisVisibility: Record<SignalAxisId, boolean> = { x: true, y: true }
  #gridVisibility: Record<SignalAxisId, boolean> = { x: true, y: true }
  #hoverVisible = true
  #legendVisible = true
  #theme: SignalViewerTheme = 'dark'
  #internalUpdate = false
  #hitPoints: HitPoint[] = []
  #dragCursor: SignalCursorId | null = null
  #pan: PanState | null = null
  #suppressClick = false
  #width = 640
  #height = 300

  constructor(host: HTMLElement, callbacks: SignalRendererCallbacks) {
    this.#host = host
    this.#callbacks = callbacks
  }

  setDescription(description: SignalDescription): void {
    this.#description = description
    this.#frame = null
    this.#axisSettings = {
      left: description.yAxes.left.range ?? 'auto',
      right: description.yAxes.right?.range ?? 'auto',
    }
    this.#rebuild()
  }

  setFrame(frame: LoadedSignalFrame, options: SignalFrameOptions = {}): void {
    if (!this.#description || this.#description.id !== frame.description.id) {
      this.setDescription(frame.description)
    }
    this.#frame = frame
    const plot = this.#plot
    if (!plot) return
    const preservedRanges = options.preserveYAxisRange ? this.#currentAxisRanges() : null
    this.#internalUpdate = true
    try {
      plot.batch(() => {
        plot.setData(alignedData(frame), false)
        const loadedIds = new Set(frame.result.series.map((series) => series.id))
        frame.description.series.forEach((series, index) => {
          plot.setSeries(index + 1, { show: loadedIds.has(series.id) }, false)
        })
        plot.setScale('x', { min: frame.requestedViewport.xMin, max: frame.requestedViewport.xMax })
      })
      plot.batch(() => {
        this.#applyAxisRange('left', preservedRanges?.left ?? null)
        if (frame.description.yAxes.right) this.#applyAxisRange('right', preservedRanges?.right ?? null)
      })
    } finally {
      this.#internalUpdate = false
    }
    plot.redraw()
  }

  setOverlays(overlays: SignalOverlays): void {
    this.#overlays = {
      scatterSeries: overlays.scatterSeries.map((series) => ({
        ...series,
        points: series.points.map((point) => ({ ...point })),
      })),
      ...(overlays.regions ? { regions: overlays.regions.map((region) => ({ ...region })) } : {}),
      ...(overlays.selectedPointId !== undefined ? { selectedPointId: overlays.selectedPointId } : {}),
    }
    this.#plot?.redraw(false, false)
  }

  setCursors(cursors: SignalCursorState): void {
    this.#cursors = cloneCursorState(cursors)
    this.#plot?.redraw(false, false)
  }

  setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void {
    validateAxisRange(range)
    if (axis === 'right' && !this.#description?.yAxes.right) {
      throw new Error('right Y axis is not configured')
    }
    this.#axisSettings[axis] = range === 'auto' ? 'auto' : { ...range }
    this.#internalUpdate = true
    try {
      this.#applyAxisRange(axis)
    } finally {
      this.#internalUpdate = false
    }
    this.#plot?.redraw(false, true)
  }

  getAxisRange(axis: SignalYAxisId): SignalAxisRange | null {
    const scale = this.#plot?.scales[axis]
    return scale?.min == null || scale.max == null ? null : { min: scale.min, max: scale.max }
  }

  resetYAxisRanges(): void {
    const plot = this.#plot
    if (!plot) return
    this.#internalUpdate = true
    try {
      plot.batch(() => {
        this.#applyAxisRange('left')
        if (this.#description?.yAxes.right) this.#applyAxisRange('right')
      })
    } finally {
      this.#internalUpdate = false
    }
    plot.redraw(false, true)
  }

  setAxisVisible(axis: SignalAxisId, visible: boolean): void {
    if (this.#axisVisibility[axis] === visible) return
    this.#axisVisibility[axis] = visible
    this.#rebuild()
  }

  getAxisVisible(axis: SignalAxisId): boolean {
    return this.#axisVisibility[axis]
  }

  setGridVisible(axis: SignalAxisId, visible: boolean): void {
    if (this.#gridVisibility[axis] === visible) return
    this.#gridVisibility[axis] = visible
    this.#rebuild()
  }

  getGridVisible(axis: SignalAxisId): boolean {
    return this.#gridVisibility[axis]
  }

  setHoverVisible(visible: boolean): void {
    if (this.#hoverVisible === visible) return
    this.#hoverVisible = visible
    this.#rebuild()
  }

  getHoverVisible(): boolean {
    return this.#hoverVisible
  }

  setLegendVisible(visible: boolean): void {
    if (this.#legendVisible === visible) return
    this.#legendVisible = visible
    this.#applyLegendVisibility()
    this.#fitPlotToHost()
  }

  getLegendVisible(): boolean {
    return this.#legendVisible
  }

  setTheme(theme: SignalViewerTheme): void {
    if (this.#theme === theme) return
    this.#theme = theme
    this.#rebuild()
  }

  getTheme(): SignalViewerTheme {
    return this.#theme
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
    this.#width = nextWidth
    this.#height = nextHeight
    this.#fitPlotToHost()
  }

  destroy(): void {
    this.#endCursorDrag(false)
    this.#endPan(false)
    this.#plot?.destroy()
    this.#plot = null
    this.#host.replaceChildren()
  }

  #rebuild(): void {
    const preservedRanges = this.#frame ? this.#currentAxisRanges() : null
    this.#plot?.destroy()
    this.#host.replaceChildren()
    const description = this.#description
    if (!description) return
    const theme = SIGNAL_VIEWER_THEMES[this.#theme]
    const options: uPlot.Options = {
      width: this.#width,
      height: this.#height,
      legend: { show: true, live: this.#hoverVisible },
      cursor: {
        show: true,
        ...(this.#hoverVisible ? {} : { x: false, y: false, points: { show: false } }),
        drag: { x: true, y: true, uni: Infinity, setScale: true },
        bind: { mousedown: (_plot, _target, handler) => (event) => {
          if (event.shiftKey && this.#beginPan(event)) return null
          if (!this.#beginCursorDrag(event)) return handler(event)
          return null
        }, dblclick: () => (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.#callbacks.resetViewRequest()
          return null
        } },
      },
      scales: { x: { time: false }, left: { auto: false }, right: { auto: false } },
      axes: [
        axisOptions('x', axisLabel(description.xLabel, description.xUnit), this.#axisVisibility.x, this.#gridVisibility.x, 55, theme),
        axisOptions('left', axisLabel(description.yAxes.left.label, description.yAxes.left.unit), this.#axisVisibility.y, this.#gridVisibility.y, 65, theme),
        ...(description.yAxes.right
          ? [{
              ...axisOptions('right', axisLabel(description.yAxes.right.label, description.yAxes.right.unit), this.#axisVisibility.y, false, 65, theme),
              side: 1 as const,
              grid: { show: false },
            }]
          : []),
      ],
      series: [
        {},
        ...description.series.map((series, index) => ({
          label: series.label,
          scale: series.yAxis ?? 'left',
          stroke: resolveTraceStyle(series.style, index).color,
          paths: () => null,
          points: { show: false },
        })),
      ],
      hooks: {
        setScale: [(_plot, key) => this.#onScale(key)],
        draw: [(plot) => this.#draw(plot)],
        ready: [(plot) => {
          plot.over.addEventListener('click', this.#onClick)
          plot.over.addEventListener('wheel', this.#onWheel, { passive: false })
          this.#configureLegend(plot)
        }],
      },
    }
    this.#plot = new uPlot(options, emptyData(description.series.length), this.#host)
    this.#applyLegendVisibility()
    this.#fitPlotToHost()
    if (this.#frame) {
      this.setFrame(this.#frame)
      if (preservedRanges) this.#restoreAxisRanges(preservedRanges)
    }
  }

  #fitPlotToHost(): void {
    const plot = this.#plot
    if (!plot) return
    const legendHeight = plot.root.querySelector<HTMLElement>('.u-legend')?.offsetHeight ?? 0
    const width = this.#host.clientWidth || this.#width
    const height = this.#host.clientHeight || this.#height
    const plotHeight = Math.max(1, height - legendHeight)
    if (plot.width !== width || plot.height !== plotHeight) plot.setSize({ width, height: plotHeight })
  }

  #applyLegendVisibility(): void {
    const legend = this.#plot?.root.querySelector<HTMLElement>('.u-legend')
    if (legend) legend.hidden = !this.#legendVisible
  }

  #configureLegend(plot: uPlot): void {
    const legend = plot.root.querySelector<HTMLElement>('.u-legend')
    if (!legend || !this.#description) return
    const rows = [...legend.querySelectorAll<HTMLElement>('.u-series')]
    const traceRows = rows.slice(-this.#description.series.length)
    traceRows.forEach((row, index) => {
      const descriptor = this.#description?.series[index]
      if (!descriptor) return
      row.dataset.seriesId = descriptor.id
      row.dataset.seriesIndex = String(index + 1)
    })
    legend.addEventListener('click', this.#onLegendClick, true)
  }

  #applyAxisRange(axis: SignalYAxisId, preserved: SignalAxisRange | null = null): void {
    const plot = this.#plot
    if (!plot) return
    const setting = this.#axisSettings[axis]
    const range = preserved ?? (setting === 'auto' ? frameAxisRange(this.#frame, axis) : setting)
    const current = this.getAxisRange(axis)
    plot.setScale(axis, range ?? current ?? { min: -1, max: 1 })
  }

  #currentAxisRanges(): Record<SignalYAxisId, SignalAxisRange | null> {
    return { left: this.getAxisRange('left'), right: this.getAxisRange('right') }
  }

  #restoreAxisRanges(ranges: Record<SignalYAxisId, SignalAxisRange | null>): void {
    const plot = this.#plot
    if (!plot) return
    this.#internalUpdate = true
    try {
      if (ranges.left) plot.setScale('left', ranges.left)
      if (ranges.right && this.#description?.yAxes.right) plot.setScale('right', ranges.right)
    } finally {
      this.#internalUpdate = false
    }
    plot.redraw(false, true)
  }

  #onScale(key: string): void {
    if (this.#internalUpdate || key !== 'x' || !this.#plot) return
    const scale = this.#plot.scales['x']
    if (scale?.min == null || scale.max == null) return
    this.#callbacks.viewportChange({ xMin: scale.min, xMax: scale.max })
  }

  #onWheel = (event: WheelEvent): void => {
    const plot = this.#plot
    const description = this.#description
    const scale = plot?.scales['x']
    if (!plot || !description || scale?.min == null || scale.max == null || event.deltaY === 0) return
    event.preventDefault()
    const rect = plot.over.getBoundingClientRect()
    const anchorFraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const current = { min: scale.min, max: scale.max }
    const bounds = {
      min: description.xStart,
      max: description.xStart + (description.sampleCount - 1) * description.xStep,
    }
    const currentSpan = current.max - current.min
    const deltaPixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1)
    const requestedSpan = currentSpan * Math.exp(Math.max(-1000, Math.min(1000, deltaPixels)) * 0.002)
    const nextSpan = Math.max(description.xStep, Math.min(bounds.max - bounds.min, requestedSpan))
    plot.setScale('x', clampRange(zoomRange(current, nextSpan / currentSpan, anchorFraction), bounds))
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
    for (const result of frame.result.series) {
      const index = frame.description.series.findIndex(({ id }) => id === result.id)
      const descriptor = frame.description.series[index]
      if (!descriptor) continue
      if (plot.series[index + 1]?.show === false) continue
      const style = resolveTraceStyle(descriptor.style, index)
      if (result.kind === 'samples') this.#drawSamples(plot, frame, result, descriptor.yAxis ?? 'left', style)
      else this.#drawMinMax(plot, frame, result, descriptor.yAxis ?? 'left', style)
    }
    this.#drawPoints(plot)
    this.#drawCursors(plot)
    ctx.restore()
  }

  #drawSamples(
    plot: uPlot,
    frame: LoadedSignalFrame,
    series: SampleSeriesResult,
    axis: SignalYAxisId,
    style: ReturnType<typeof resolveTraceStyle>,
  ): void {
    const { ctx } = plot
    ctx.beginPath()
    ctx.strokeStyle = style.color
    ctx.lineWidth = style.lineWidth * devicePixelRatio
    let started = false
    for (let index = 0; index < series.values.length; index += 1) {
      const y = series.values[index]
      if (y === undefined || !Number.isFinite(y)) { started = false; continue }
      const left = plot.valToPos(sampleX(frame, frame.result.startSample + index), 'x', true)
      const top = plot.valToPos(y, axis, true)
      if (!started) { ctx.moveTo(left, top); started = true } else ctx.lineTo(left, top)
      if (style.markers) {
        ctx.moveTo(left + style.markerSize * devicePixelRatio, top)
        ctx.arc(left, top, style.markerSize * devicePixelRatio, 0, Math.PI * 2)
      }
    }
    ctx.stroke()
  }

  #drawMinMax(
    plot: uPlot,
    frame: LoadedSignalFrame,
    series: MinMaxSeriesResult,
    axis: SignalYAxisId,
    style: ReturnType<typeof resolveTraceStyle>,
  ): void {
    const { ctx } = plot
    ctx.strokeStyle = style.color
    ctx.lineWidth = style.lineWidth * devicePixelRatio
    const envelope = new Path2D()
    const midpoint = new Path2D()
    let midpointStarted = false
    for (let index = 0; index < series.minimum.length; index += 1) {
      const low = series.minimum[index]
      const high = series.maximum[index]
      if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high)) {
        midpointStarted = false
        continue
      }
      const sample = frame.result.startSample + index * series.factor + series.factor / 2
      const left = plot.valToPos(sampleX(frame, sample), 'x', true)
      envelope.moveTo(left, plot.valToPos(low, axis, true))
      envelope.lineTo(left, plot.valToPos(high, axis, true))
      const middle = plot.valToPos((low + high) / 2, axis, true)
      if (midpointStarted) midpoint.lineTo(left, middle)
      else { midpoint.moveTo(left, middle); midpointStarted = true }
    }
    ctx.stroke(midpoint)
    ctx.stroke(envelope)
  }

  #drawRegions(plot: uPlot): void {
    for (const region of this.#overlays.regions ?? []) {
      const left = plot.valToPos(region.xStart, 'x', true)
      const right = plot.valToPos(region.xStop, 'x', true)
      plot.ctx.fillStyle = region.color ?? 'rgba(148, 163, 184, 0.12)'
      plot.ctx.fillRect(left, plot.bbox.top, right - left, plot.bbox.height)
    }
  }

  #drawPoints(plot: uPlot): void {
    this.#hitPoints = []
    for (const series of this.#overlays.scatterSeries) {
      if (series.visible === false) continue
      for (const point of series.points) {
        if (!visiblePoint(plot, point)) continue
        const left = plot.valToPos(point.x, 'x', true)
        const top = plot.valToPos(point.y, 'left', true)
        const selected = point.id === this.#overlays.selectedPointId
        const radius = (selected ? 5 : 3.5) * devicePixelRatio
        plot.ctx.beginPath()
        plot.ctx.arc(left, top, radius, 0, Math.PI * 2)
        plot.ctx.fillStyle = point.color ?? series.color ?? '#22d3ee'
        plot.ctx.fill()
        if (selected) {
          plot.ctx.strokeStyle = '#ffffff'
          plot.ctx.lineWidth = 2 * devicePixelRatio
          plot.ctx.stroke()
        }
        this.#hitPoints.push({ id: point.id, left: plot.valToPos(point.x, 'x'), top: plot.valToPos(point.y, 'left') })
      }
    }
  }

  #drawCursors(plot: uPlot): void {
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      const cursor = this.#cursors[id]
      if (!cursor.visible || cursor.value == null) continue
      const vertical = id === 'a' || id === 'b'
      const position = plot.valToPos(cursor.value, vertical ? 'x' : 'left', true)
      const { ctx } = plot
      ctx.beginPath()
      ctx.strokeStyle = cursor.color ?? '#facc15'
      ctx.lineWidth = 1.5 * devicePixelRatio
      ctx.setLineDash([5 * devicePixelRatio, 4 * devicePixelRatio])
      if (vertical) { ctx.moveTo(position, plot.bbox.top); ctx.lineTo(position, plot.bbox.top + plot.bbox.height) }
      else { ctx.moveTo(plot.bbox.left, position); ctx.lineTo(plot.bbox.left + plot.bbox.width, position) }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = cursor.color ?? '#facc15'
      ctx.font = `${11 * devicePixelRatio}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(
        id.toUpperCase(),
        vertical ? position + 4 * devicePixelRatio : plot.bbox.left + 4 * devicePixelRatio,
        vertical ? plot.bbox.top + 3 * devicePixelRatio : position + 3 * devicePixelRatio,
      )
    }
  }

  #beginCursorDrag(event: MouseEvent): boolean {
    const plot = this.#plot
    if (!plot) return false
    const rect = plot.over.getBoundingClientRect()
    const left = event.clientX - rect.left
    const top = event.clientY - rect.top
    let nearest: SignalCursorId | null = null
    let distance = 8
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      const cursor = this.#cursors[id]
      if (!cursor.visible || cursor.value == null) continue
      const vertical = id === 'a' || id === 'b'
      const position = plot.valToPos(cursor.value, vertical ? 'x' : 'left')
      const next = Math.abs(position - (vertical ? left : top))
      if (next <= distance) { nearest = id; distance = next }
    }
    if (!nearest) return false
    event.preventDefault()
    event.stopPropagation()
    this.#dragCursor = nearest
    window.addEventListener('mousemove', this.#onCursorMove)
    window.addEventListener('mouseup', this.#onCursorUp, { once: true })
    return true
  }

  #onCursorMove = (event: MouseEvent): void => {
    const plot = this.#plot
    const id = this.#dragCursor
    if (!plot || !id) return
    const rect = plot.over.getBoundingClientRect()
    const vertical = id === 'a' || id === 'b'
    const position = vertical ? event.clientX - rect.left : event.clientY - rect.top
    const scale = plot.scales[vertical ? 'x' : 'left']
    if (!scale || scale.min == null || scale.max == null) return
    const value = plot.posToVal(position, vertical ? 'x' : 'left')
    this.#cursors[id] = { ...this.#cursors[id], value: Math.max(scale.min, Math.min(scale.max, value)) }
    plot.redraw(false, false)
  }

  #onCursorUp = (): void => this.#endCursorDrag(true)

  #endCursorDrag(emit: boolean): void {
    window.removeEventListener('mousemove', this.#onCursorMove)
    const id = this.#dragCursor
    this.#dragCursor = null
    if (emit && id) this.#callbacks.cursorChange(cursorChange(id, this.#cursors))
  }

  #onClick = (event: MouseEvent): void => {
    const plot = this.#plot
    if (!plot || this.#dragCursor) return
    if (this.#suppressClick) { this.#suppressClick = false; return }
    const rect = plot.over.getBoundingClientRect()
    const left = event.clientX - rect.left
    const top = event.clientY - rect.top
    let closest: HitPoint | null = null
    let distance = 9
    for (const point of this.#hitPoints) {
      const next = Math.hypot(point.left - left, point.top - top)
      if (next <= distance) { distance = next; closest = point }
    }
    this.#callbacks.overlaySelect(closest?.id ?? null)
  }

  #beginPan(event: MouseEvent): boolean {
    const plot = this.#plot
    const x = scaleRange(plot, 'x')
    const leftY = scaleRange(plot, 'left')
    if (!plot || !x || !leftY) return false
    const rect = plot.over.getBoundingClientRect()
    this.#pan = {
      left: event.clientX - rect.left,
      top: event.clientY - rect.top,
      x,
      leftY,
      rightY: scaleRange(plot, 'right'),
      moved: false,
    }
    event.preventDefault()
    event.stopPropagation()
    plot.over.style.cursor = 'grabbing'
    window.addEventListener('mousemove', this.#onPanMove)
    window.addEventListener('mouseup', this.#onPanUp, { once: true })
    return true
  }

  #onPanMove = (event: MouseEvent): void => {
    const plot = this.#plot
    const pan = this.#pan
    const description = this.#description
    if (!plot || !pan || !description) return
    const rect = plot.over.getBoundingClientRect()
    const dx = event.clientX - rect.left - pan.left
    const dy = event.clientY - rect.top - pan.top
    pan.moved ||= Math.hypot(dx, dy) >= 2
    const x = translateRange(pan.x, -dx / plot.bbox.width)
    const full = {
      min: description.xStart,
      max: description.xStart + description.xStep * (description.sampleCount - 1),
    }
    const clampedX = clampRange(x, full)
    this.#internalUpdate = true
    try {
      plot.batch(() => {
        plot.setScale('x', clampedX)
        plot.setScale('left', translateRange(pan.leftY, dy / plot.bbox.height))
        if (pan.rightY) plot.setScale('right', translateRange(pan.rightY, dy / plot.bbox.height))
      })
    } finally {
      this.#internalUpdate = false
    }
  }

  #onPanUp = (): void => this.#endPan(true)

  #endPan(commit: boolean): void {
    window.removeEventListener('mousemove', this.#onPanMove)
    const pan = this.#pan
    this.#pan = null
    if (this.#plot) this.#plot.over.style.cursor = ''
    if (!commit || !pan?.moved || !this.#plot) return
    this.#suppressClick = true
    const x = scaleRange(this.#plot, 'x')
    if (x) this.#callbacks.viewportChange({ xMin: x.min, xMax: x.max })
  }

  #onLegendClick = (event: MouseEvent): void => {
    const row = (event.target as Element | null)?.closest<HTMLElement>('.u-series[data-series-id]')
    const index = Number(row?.dataset.seriesIndex)
    const id = row?.dataset.seriesId
    const plot = this.#plot
    if (!id || !plot || !Number.isInteger(index)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#callbacks.traceVisibilityRequest(id, plot.series[index]?.show === false)
  }
}

function scaleRange(plot: uPlot | null, key: string): SignalAxisRange | null {
  const scale = plot?.scales[key]
  return scale?.min == null || scale.max == null ? null : { min: scale.min, max: scale.max }
}

function emptyData(seriesCount: number): uPlot.AlignedData {
  return Array.from({ length: seriesCount + 1 }, () => [] as number[]) as unknown as uPlot.AlignedData
}

function alignedData(frame: LoadedSignalFrame): uPlot.AlignedData {
  const first = frame.result.series[0]
  if (!first) return emptyData(frame.description.series.length)
  const length = resultLength(first)
  for (const series of frame.result.series) {
    if (series.kind !== first.kind || resultLength(series) !== length) {
      throw new Error('all visible series must use the same range representation')
    }
    if (series.kind === 'minmax' && first.kind === 'minmax' && series.factor !== first.factor) {
      throw new Error('all visible min/max series must use the same factor')
    }
  }
  const factor = first.kind === 'minmax' ? first.factor : 1
  const x = Array.from({ length }, (_, index) =>
    sampleX(frame, frame.result.startSample + index * factor + (factor === 1 ? 0 : factor / 2)),
  )
  const byId = new Map(frame.result.series.map((series) => [series.id, series]))
  const values = frame.description.series.map(({ id }) => {
    const series = byId.get(id)
    if (!series) return Array.from({ length }, () => null)
    return series.kind === 'samples'
      ? Array.from(series.values)
      : Array.from(series.minimum, (low, index) => (low + (series.maximum[index] ?? low)) / 2)
  })
  return [x, ...values] as uPlot.AlignedData
}

function frameAxisRange(frame: LoadedSignalFrame | null, axis: SignalYAxisId): SignalAxisRange | null {
  if (!frame) return null
  const descriptors = new Map(frame.description.series.map((series) => [series.id, series]))
  let minimum = Infinity
  let maximum = -Infinity
  for (const series of frame.result.series) {
    if ((descriptors.get(series.id)?.yAxis ?? 'left') !== axis) continue
    const arrays = series.kind === 'samples' ? [series.values] : [series.minimum, series.maximum]
    for (const values of arrays) for (const value of values) if (Number.isFinite(value)) {
      minimum = Math.min(minimum, value); maximum = Math.max(maximum, value)
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null
  const padding = Math.max((maximum - minimum) * 0.05, Math.abs(maximum) * 0.01, 1e-9)
  return { min: minimum - padding, max: maximum + padding }
}

function validateAxisRange(range: SignalAxisRangeSetting): void {
  if (range !== 'auto' && (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min)) {
    throw new Error('axis range requires finite min < max')
  }
}

function resultLength(series: SignalSeriesResult): number {
  return series.kind === 'samples' ? series.values.length : series.minimum.length
}

function sampleX(frame: LoadedSignalFrame, sample: number): number {
  return frame.description.xStart + sample * frame.description.xStep
}

function axisLabel(label: string, unit: string): string { return unit ? `${label} (${unit})` : label }

function axisOptions(
  scale: string,
  label: string,
  axisVisible: boolean,
  gridVisible: boolean,
  size: number,
  theme: SignalViewerThemeTokens,
): uPlot.Axis {
  return {
    scale,
    label: axisVisible ? label : '',
    show: true,
    size,
    stroke: axisVisible ? theme.axis : 'transparent',
    ticks: { show: axisVisible, stroke: theme.axis, width: 1 },
    border: { show: axisVisible, stroke: theme.axis, width: 1 },
    grid: { show: gridVisible, stroke: theme.grid, width: 1 },
  }
}

function visiblePoint(plot: uPlot, point: SignalOverlayPoint): boolean {
  const x = plot.scales['x']; const y = plot.scales['left']
  return x != null && y != null && x.min != null && x.max != null && y.min != null && y.max != null &&
    point.x >= x.min && point.x <= x.max && point.y >= y.min && point.y <= y.max
}
