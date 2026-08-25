import type { OmeZarrReadableStore, StoreRange } from './types'

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | string
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}

/** Return whether this browser exposes a user-mediated directory picker. */
export function browserDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Partial<DirectoryPickerWindow>).showDirectoryPicker === 'function'
  )
}

/** Ask the user to grant read-only access to one OME-Zarr image directory. */
export function pickOmeZarrDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!browserDirectoryPickerSupported()) {
    return Promise.reject(
      new Error('Opening local OME-Zarr directories is not supported by this browser.'),
    )
  }
  return (window as unknown as DirectoryPickerWindow).showDirectoryPicker({
    id: 'mapmanager-image-viewer-ome-zarr',
    mode: 'read',
  })
}

/** Lazy, read-only Zarrita store backed by a browser-granted directory. */
export class BrowserDirectoryStore implements OmeZarrReadableStore {
  constructor(readonly root: FileSystemDirectoryHandle) {}

  async get(key: `/${string}`, options?: unknown): Promise<Uint8Array | undefined> {
    const signal = requestSignal(options)
    signal?.throwIfAborted()
    const file = await fileAt(this.root, storeSegments(key))
    if (!file) return undefined
    const bytes = new Uint8Array(await file.arrayBuffer())
    signal?.throwIfAborted()
    return bytes
  }

  async getRange(
    key: `/${string}`,
    range: StoreRange,
    options?: unknown,
  ): Promise<Uint8Array | undefined> {
    const signal = requestSignal(options)
    signal?.throwIfAborted()
    const file = await fileAt(this.root, storeSegments(key))
    if (!file) return undefined
    const [start, end] = byteRange(range, file.size)
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer())
    signal?.throwIfAborted()
    return bytes
  }
}

function storeSegments(key: `/${string}`): string[] {
  const segments = key.slice(1).split('/')
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid OME-Zarr store key: ${key}`)
  }
  return segments
}

async function fileAt(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
): Promise<File | undefined> {
  let directory = root
  try {
    for (const segment of segments.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment)
    }
    return await (await directory.getFileHandle(segments.at(-1)!)).getFile()
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'NotFoundError') return undefined
    throw reason
  }
}

function byteRange(range: StoreRange, size: number): [start: number, end: number] {
  if ('suffixLength' in range) {
    if (!Number.isInteger(range.suffixLength) || range.suffixLength < 0) {
      throw new Error('Invalid suffix byte range')
    }
    return [Math.max(0, size - range.suffixLength), size]
  }
  if (
    !Number.isInteger(range.offset) ||
    !Number.isInteger(range.length) ||
    range.offset < 0 ||
    range.length < 0 ||
    range.offset > size
  ) {
    throw new Error('Invalid byte range')
  }
  return [range.offset, Math.min(size, range.offset + range.length)]
}

function requestSignal(options: unknown): AbortSignal | undefined {
  if (!options || typeof options !== 'object' || !('signal' in options)) return undefined
  const signal = options.signal
  return signal && typeof signal === 'object' && 'throwIfAborted' in signal
    ? (signal as AbortSignal)
    : undefined
}
