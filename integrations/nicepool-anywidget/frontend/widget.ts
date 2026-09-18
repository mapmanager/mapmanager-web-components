import {
  registerNicePoolElement,
  type DatasetInput,
  type NicePoolSelection,
  type NicePoolState,
  type NicePoolTheme,
  type NicePoolPreset,
} from '@mapmanager/nicepool'

interface AnyWidgetModel {
  get(name: string): unknown
  set(name: string, value: unknown): void
  save_changes(): void
  on(name: string, callback: () => void): void
  off(name: string, callback: () => void): void
}

interface NicePoolDomElement extends HTMLElement {
  setData(input: DatasetInput): void
  replaceData(input: DatasetInput): void
  setState(state: NicePoolState): void
  setSelection(selection: NicePoolSelection): void
  setNicePoolPresets(presets: readonly NicePoolPreset[]): void
  setTheme(theme: NicePoolTheme): void
}

interface RenderContext {
  model: AnyWidgetModel
  el: HTMLElement
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function updateModel(model: AnyWidgetModel, name: string, value: unknown): void {
  if (valuesEqual(model.get(name), value)) return
  model.set(name, value)
  model.save_changes()
}

function render({ model, el }: RenderContext): () => void {
  registerNicePoolElement()

  const pool = document.createElement('nice-pool') as NicePoolDomElement
  pool.style.display = 'block'
  pool.style.width = '100%'
  el.replaceChildren(pool)

  const updateData = (): void => pool.setData(model.get('data') as DatasetInput)
  const replaceData = (): void => {
    const request = model.get('_replace_data_request') as { data?: DatasetInput }
    if (!request?.data) return
    try {
      pool.replaceData(request.data)
      updateModel(model, 'replace_data_error', '')
    } catch (reason) {
      updateModel(model, 'replace_data_error', reason instanceof Error ? reason.message : String(reason))
    }
  }
  const updateState = (): void => {
    const state = model.get('state') as Partial<NicePoolState>
    if (state?.schemaVersion === 1) pool.setState(state as NicePoolState)
  }
  const updateSelection = (): void => pool.setSelection(model.get('selection') as NicePoolSelection)
  const updatePresets = (): void => pool.setNicePoolPresets(model.get('nicepool_presets') as NicePoolPreset[])
  const updateTheme = (): void => pool.setTheme(model.get('theme') as NicePoolTheme)
  const updateHeight = (): void => {
    pool.style.height = `${String(model.get('height'))}px`
  }

  const subscriptions: Array<[string, () => void]> = [
    ['change:data', updateData],
    ['change:_replace_data_request', replaceData],
    ['change:state', updateState],
    ['change:selection', updateSelection],
    ['change:nicepool_presets', updatePresets],
    ['change:theme', updateTheme],
    ['change:height', updateHeight],
  ]
  subscriptions.forEach(([name, callback]) => model.on(name, callback))

  const eventController = new AbortController()
  const eventOptions = { signal: eventController.signal }
  pool.addEventListener('nicepool-selection-change', (event) => {
    updateModel(model, 'selection', (event as CustomEvent<NicePoolSelection>).detail)
  }, eventOptions)
  pool.addEventListener('nicepool-state-change', (event) => {
    updateModel(model, 'state', (event as CustomEvent<NicePoolState>).detail)
  }, eventOptions)
  pool.addEventListener('nicepool-presets-change', (event) => {
    updateModel(model, 'nicepool_presets', (event as CustomEvent<NicePoolPreset[]>).detail)
  }, eventOptions)
  pool.addEventListener('nicepool-theme-change', (event) => {
    updateModel(model, 'theme', (event as CustomEvent<NicePoolTheme>).detail)
  }, eventOptions)

  updateHeight()
  updateData()
  updatePresets()
  updateTheme()
  updateState()
  updateSelection()

  return () => {
    eventController.abort()
    subscriptions.forEach(([name, callback]) => model.off(name, callback))
    pool.remove()
  }
}

export default { render }
