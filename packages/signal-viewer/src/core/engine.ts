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

  async setSource(source: SignalSource, targetPoints: number): Promise<LoadedSignalFrame> {
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
      return await this.#load(fullViewport(description), targetPoints, generation, controller)
    } catch (reason) {
      if (generation === this.#generation && !isAbort(reason)) {
        this.error = reason instanceof Error ? reason.message : String(reason)
      }
      throw reason
    } finally {
      if (generation === this.#generation) this.loading = false
    }
  }

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
    const seriesIds = description.series.map(({ id }) => id)
    const result = await source.getRange({
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

export function isAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}
