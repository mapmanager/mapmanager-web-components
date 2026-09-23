import { fullViewport, normalizeViewport, validateDescription, validateRangeResult, viewportSamples } from './range'
import type { LoadedSignalFrame, SignalDescription, SignalSource, SignalViewport } from './types'

/** Coordinates async range loading without depending on Vue or a renderer. */
export class SignalViewerEngine {
  description: SignalDescription | null = null
  frame: LoadedSignalFrame | null = null
  error: string | null = null
  loading = false
  #source: SignalSource | null = null
  #controller: AbortController | null = null
  #generation = 0
  #visibleSeries = new Set<string>()

  /** Replace the complete source session and load its full-range overview. */
  async setSource(
    source: SignalSource,
    targetPoints: number,
    initiallyVisible?: readonly string[],
    initialViewport?: SignalViewport,
  ): Promise<LoadedSignalFrame> {
    this.abort()
    const generation = ++this.#generation
    const controller = new AbortController()
    this.#controller = controller
    this.loading = true
    this.error = null
    try {
      const description = await source.describe(controller.signal)
      validateDescription(description)
      if (generation !== this.#generation) throw abortError()
      this.#source = source
      this.description = description
      this.frame = null
      const available = new Set(description.series.map(({ id }) => id))
      const requested = initiallyVisible ?? [...available]
      if (requested.some((id) => !available.has(id))) throw new Error('initial visibility contains an unknown series id')
      this.#visibleSeries = new Set(requested)
      return await this.#load(initialViewport ?? fullViewport(description), targetPoints, generation, controller)
    } catch (reason) {
      if (generation === this.#generation && !isAbort(reason)) {
        this.error = reason instanceof Error ? reason.message : String(reason)
      }
      throw reason
    } finally {
      if (generation === this.#generation) this.loading = false
    }
  }

  /** Load a new calibrated X viewport from the current source. */
  async setViewport(viewport: SignalViewport, targetPoints: number): Promise<LoadedSignalFrame> {
    if (!this.#source || !this.description) throw new Error('no signal source is loaded')
    this.#controller?.abort()
    const generation = ++this.#generation
    const controller = new AbortController()
    this.#controller = controller
    this.loading = true
    this.error = null
    try {
      return await this.#load(viewport, targetPoints, generation, controller)
    } catch (reason) {
      if (generation === this.#generation && !isAbort(reason)) {
        this.error = reason instanceof Error ? reason.message : String(reason)
      }
      throw reason
    } finally {
      if (generation === this.#generation) this.loading = false
    }
  }

  /** Return visible series IDs in source declaration order. */
  getVisibleSeries(): readonly string[] {
    return this.description?.series
      .map(({ id }) => id)
      .filter((id) => this.#visibleSeries.has(id)) ?? []
  }

  /** Replace series visibility and reload the current visible range. */
  async setVisibleSeries(
    seriesIds: readonly string[],
    targetPoints: number,
  ): Promise<LoadedSignalFrame> {
    const description = this.description
    if (!description) throw new Error('no signal source is loaded')
    const available = new Set(description.series.map(({ id }) => id))
    if (seriesIds.some((id) => !available.has(id))) throw new Error('unknown visible series id')
    this.#visibleSeries = new Set(seriesIds)
    const viewport = this.frame?.requestedViewport ?? fullViewport(description)
    return this.setViewport(viewport, targetPoints)
  }

  /** Show or hide one series and reload the current visible range. */
  async setSeriesVisibility(
    seriesId: string,
    visible: boolean,
    targetPoints: number,
  ): Promise<LoadedSignalFrame> {
    const current = new Set(this.getVisibleSeries())
    if (!this.description?.series.some(({ id }) => id === seriesId)) {
      throw new Error(`unknown series id: ${seriesId}`)
    }
    if (visible) current.add(seriesId)
    else current.delete(seriesId)
    return this.setVisibleSeries([...current], targetPoints)
  }

  /** Cancel the active request and prevent its result from becoming current. */
  abort(): void {
    this.#controller?.abort()
    this.#controller = null
    this.#generation += 1
    this.loading = false
  }

  async #load(
    viewport: SignalViewport,
    targetPoints: number,
    generation: number,
    controller: AbortController,
  ): Promise<LoadedSignalFrame> {
    const source = this.#source
    const description = this.description
    if (!source || !description) throw new Error('no signal source is loaded')
    const requestedViewport = normalizeViewport(description, viewport)
    const samples = viewportSamples(description, requestedViewport)
    const seriesIds = this.getVisibleSeries()
    const result = seriesIds.length === 0
      ? { ...samples, series: [] }
      : await source.getRange({
          ...samples,
          targetPoints: Math.max(2, Math.floor(targetPoints)),
          seriesIds,
          signal: controller.signal,
        })
    if (generation !== this.#generation) throw abortError()
    validateRangeResult(description, result, seriesIds)
    const frame = { description, requestedViewport, result }
    this.frame = frame
    return frame
  }
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** Return whether a caught value represents normal request cancellation. */
export function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}
