import {
  registerNicePoolElement,
  type DatasetInput,
  type NicePoolPreset,
  type NicePoolSelection,
  type NicePoolState,
  type NicePoolTheme,
} from '@mapmanager/nicepool'

interface QtSignal {
  connect(callback: (message: string) => void): void
}

interface PythonBridge {
  command: QtSignal
  receive(message: string): void
}

interface WebChannel {
  objects: { nicePoolBridge: PythonBridge }
}

interface QtNamespace {
  webChannelTransport: unknown
}

interface NicePoolDomElement extends HTMLElement {
  setData(input: DatasetInput): void
  setState(state: NicePoolState): void
  getState(): NicePoolState
  setNicePoolPresets(presets: readonly NicePoolPreset[]): void
  getNicePoolPresets(): NicePoolPreset[]
  applyNicePoolPreset(name: string): void
  setShowPresetEditing(visible: boolean): void
  getShowPresetEditing(): boolean
  setControlsCollapsed(collapsed: boolean): void
  getControlsCollapsed(): boolean
  setSelection(selection: NicePoolSelection): void
  setPrimarySelection(rowId: string | number | null): void
  clearSelection(): void
  getSelection(): NicePoolSelection
  getPlotSummary(): unknown
  setTheme(theme: NicePoolTheme): void
  getTheme(): NicePoolTheme
}

interface CommandEnvelope {
  id: number
  name: string
  payload?: unknown
}

declare global {
  interface Window {
    qt: QtNamespace
    QWebChannel: new (transport: unknown, callback: (channel: WebChannel) => void) => unknown
  }
}

if (typeof globalThis.structuredClone !== 'function') {
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    writable: true,
  })
}

registerNicePoolElement()

const pool = document.querySelector<NicePoolDomElement>('nice-pool')
if (!pool) throw new Error('The NicePool host page is missing its <nice-pool> element')

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
  const bridge = channel.objects.nicePoolBridge
  let commandDepth = 0

  const send = (message: unknown): void => bridge.receive(JSON.stringify(message))

  const emitBrowserEvent = (name: string, detail: unknown): void => {
    if (commandDepth > 0) return
    send({ kind: 'event', name, detail })
  }

  pool.addEventListener('nicepool-selection-change', (event) => {
    emitBrowserEvent('selectionChanged', (event as CustomEvent<NicePoolSelection>).detail)
  })
  pool.addEventListener('nicepool-state-change', (event) => {
    emitBrowserEvent('stateChanged', (event as CustomEvent<NicePoolState>).detail)
  })
  pool.addEventListener('nicepool-presets-change', (event) => {
    emitBrowserEvent('presetsChanged', (event as CustomEvent<NicePoolPreset[]>).detail)
  })
  pool.addEventListener('nicepool-theme-change', (event) => {
    emitBrowserEvent('themeChanged', (event as CustomEvent<NicePoolTheme>).detail)
  })
  pool.addEventListener('nicepool-data-reset', () => {
    send({ kind: 'event', name: 'dataReset', detail: null })
  })

  const execute = (command: CommandEnvelope): unknown => {
    switch (command.name) {
      case 'setData': return pool.setData(command.payload as DatasetInput)
      case 'setState': return pool.setState(command.payload as NicePoolState)
      case 'getState': return pool.getState()
      case 'setPresets': return pool.setNicePoolPresets(command.payload as NicePoolPreset[])
      case 'getPresets': return pool.getNicePoolPresets()
      case 'applyPreset': return pool.applyNicePoolPreset(command.payload as string)
      case 'setPresetEditingVisible': return pool.setShowPresetEditing(command.payload as boolean)
      case 'getPresetEditingVisible': return pool.getShowPresetEditing()
      case 'setControlsCollapsed': return pool.setControlsCollapsed(command.payload as boolean)
      case 'getControlsCollapsed': return pool.getControlsCollapsed()
      case 'setSelection': return pool.setSelection(command.payload as NicePoolSelection)
      case 'setPrimarySelection': return pool.setPrimarySelection(command.payload as string | number | null)
      case 'clearSelection': return pool.clearSelection()
      case 'getSelection': return pool.getSelection()
      case 'getPlotSummary': return pool.getPlotSummary()
      case 'setTheme': return pool.setTheme(command.payload as NicePoolTheme)
      case 'getTheme': return pool.getTheme()
      default: throw new Error(`Unknown NicePool command: ${command.name}`)
    }
  }

  bridge.command.connect((message) => {
    let command: CommandEnvelope | null = null
    try {
      command = JSON.parse(message) as CommandEnvelope
      commandDepth += 1
      const result = execute(command)
      send({ kind: 'response', id: command.id, name: command.name, ok: true, result: result ?? null })
    } catch (reason) {
      send({
        kind: 'response',
        id: command?.id ?? -1,
        name: command?.name ?? 'invalid',
        ok: false,
        error: errorText(reason),
      })
    } finally {
      if (commandDepth > 0) commandDepth -= 1
    }
  })

  send({ kind: 'ready', userAgent: navigator.userAgent })
})
