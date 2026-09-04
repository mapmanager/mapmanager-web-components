import { createApp, h, ref, type App, type ComponentPublicInstance } from 'vue'

import type { SignalOverlays, SignalSource, SignalViewport } from '../core'
import SignalViewerWidget from '../vue/SignalViewerWidget.vue'
import widgetStyles from '../vue/widget.css?inline'

interface WidgetApi {
  setSource(source: SignalSource): Promise<void>
  setViewport(viewport: SignalViewport): Promise<void>
  setOverlays(overlays: SignalOverlays): void
  resetView(): Promise<void>
  getViewport(): SignalViewport | null
}

/** Framework-neutral custom-element host for the Vue signal viewer. */
export class SignalViewerElement extends HTMLElement {
  #app: App<Element> | null = null
  #widget = ref<(ComponentPublicInstance & WidgetApi) | null>(null)
  #pendingSource: SignalSource | null = null

  connectedCallback(): void {
    if (this.#app) return
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = widgetStyles
    const mount = document.createElement('div')
    mount.style.height = '100%'
    shadow.replaceChildren(style, mount)
    this.#app = createApp({
      render: () => h(SignalViewerWidget, {
        ref: this.#widget,
        onSourceChange: (id: string) => this.#dispatch('source-change', id),
        onViewChange: (viewport: SignalViewport) => this.#dispatch('view-change', viewport),
        onOverlaySelect: (id: string | null) => this.#dispatch('overlay-select', id),
      }),
    })
    this.#app.mount(mount)
    if (this.#pendingSource) {
      const source = this.#pendingSource
      this.#pendingSource = null
      queueMicrotask(() => void this.#widget.value?.setSource(source))
    }
  }

  disconnectedCallback(): void {
    this.#app?.unmount()
    this.#app = null
    this.#widget.value = null
  }

  setSource(source: SignalSource): Promise<void> {
    if (!this.#widget.value) {
      this.#pendingSource = source
      return Promise.resolve()
    }
    return this.#widget.value.setSource(source)
  }

  setViewport(viewport: SignalViewport): Promise<void> {
    return this.#widget.value?.setViewport(viewport) ?? Promise.resolve()
  }

  setOverlays(overlays: SignalOverlays): void {
    this.#widget.value?.setOverlays(overlays)
  }

  resetView(): Promise<void> {
    return this.#widget.value?.resetView() ?? Promise.resolve()
  }

  getViewport(): SignalViewport | null {
    return this.#widget.value?.getViewport() ?? null
  }

  #dispatch<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }
}
