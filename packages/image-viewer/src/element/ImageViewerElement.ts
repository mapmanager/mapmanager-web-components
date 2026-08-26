import { createApp, h, ref, type App, type ComponentPublicInstance } from 'vue'

import type { ViewerSource } from '../engine/types'
import ImageViewerWidget from '../vue/ImageViewerWidget.vue'
import widgetStyles from '../vue/widget.css?inline'

interface WidgetApi {
  setSource(source: ViewerSource): Promise<unknown>
}

/** Framework-neutral host that mounts the Vue image viewer. */
export class ImageViewerElement extends HTMLElement {
  #app: App<Element> | null = null
  #widget = ref<(ComponentPublicInstance & WidgetApi) | null>(null)
  #pending: ViewerSource | null = null

  connectedCallback(): void {
    if (this.#app) return
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = widgetStyles
    const mount = document.createElement('div')
    mount.style.height = '100%'
    shadow.replaceChildren(style, mount)
    this.#app = createApp({
      render: () => h(ImageViewerWidget, { ref: this.#widget }),
    })
    this.#app.mount(mount)
    if (this.#pending) {
      const source = this.#pending
      this.#pending = null
      queueMicrotask(() => {
        void this.#widget.value?.setSource(source)
      })
    }
  }

  disconnectedCallback(): void {
    this.#app?.unmount()
    this.#app = null
    this.#widget.value = null
  }

  setSource(source: ViewerSource): Promise<unknown> {
    if (!this.#widget.value) {
      this.#pending = source
      return Promise.resolve()
    }
    return this.#widget.value.setSource(source)
  }
}
