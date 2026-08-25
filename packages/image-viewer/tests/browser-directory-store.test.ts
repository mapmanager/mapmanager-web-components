import { describe, expect, it } from 'vitest'

import { BrowserDirectoryStore } from '../src/engine/browser-directory-store'

describe('BrowserDirectoryStore', () => {
  it('reads root and nested keys lazily', async () => {
    const root = fakeDirectory({
      'zarr.json': bytes('root'),
      '0/zarr.json': bytes('level'),
    })
    const store = new BrowserDirectoryStore(root)

    expect(text(await store.get('/zarr.json'))).toBe('root')
    expect(text(await store.get('/0/zarr.json'))).toBe('level')
    expect(await store.get('/missing')).toBeUndefined()
  })

  it('reads offset and suffix byte ranges', async () => {
    const store = new BrowserDirectoryStore(fakeDirectory({ chunk: bytes('0123456789') }))

    expect(text(await store.getRange('/chunk', { offset: 2, length: 4 }))).toBe('2345')
    expect(text(await store.getRange('/chunk', { suffixLength: 3 }))).toBe('789')
  })

  it('honors abort signals', async () => {
    const store = new BrowserDirectoryStore(fakeDirectory({ 'zarr.json': bytes('root') }))
    const controller = new AbortController()
    controller.abort()

    await expect(store.get('/zarr.json', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('rejects keys that are not collection-relative', async () => {
    const store = new BrowserDirectoryStore(fakeDirectory({ 'zarr.json': bytes('root') }))

    await expect(store.get('/../zarr.json')).rejects.toThrow('Invalid OME-Zarr store key')
    await expect(store.get('/nested//zarr.json')).rejects.toThrow('Invalid OME-Zarr store key')
  })
})

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function text(value: Uint8Array | undefined): string {
  return new TextDecoder().decode(value)
}

function fakeDirectory(files: Record<string, Uint8Array>): FileSystemDirectoryHandle {
  const entries = new Map<string, Uint8Array | Map<string, unknown>>()
  for (const [path, data] of Object.entries(files)) {
    const segments = path.split('/')
    let directory = entries
    for (const segment of segments.slice(0, -1)) {
      const existing = directory.get(segment)
      if (existing instanceof Map) {
        directory = existing as Map<string, Uint8Array | Map<string, unknown>>
      } else {
        const child = new Map<string, Uint8Array | Map<string, unknown>>()
        directory.set(segment, child)
        directory = child
      }
    }
    directory.set(segments.at(-1)!, data)
  }
  return directoryHandle(entries)
}

function directoryHandle(
  entries: Map<string, Uint8Array | Map<string, unknown>>,
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'test.ome.zarr',
    async getDirectoryHandle(name: string) {
      const value = entries.get(name)
      if (!(value instanceof Map)) throw new DOMException('Not found', 'NotFoundError')
      return directoryHandle(value as Map<string, Uint8Array | Map<string, unknown>>)
    },
    async getFileHandle(name: string) {
      const value = entries.get(name)
      if (!(value instanceof Uint8Array)) throw new DOMException('Not found', 'NotFoundError')
      return {
        kind: 'file',
        name,
        async getFile() {
          return fakeFile(value)
        },
      } as FileSystemFileHandle
    },
  } as FileSystemDirectoryHandle
}

function fakeFile(data: Uint8Array): File {
  return {
    size: data.byteLength,
    async arrayBuffer() {
      return data.slice().buffer
    },
    slice(start = 0, end = data.byteLength) {
      const slice = data.slice(start, end)
      return {
        size: slice.byteLength,
        async arrayBuffer() {
          return slice.buffer
        },
      } as Blob
    },
  } as File
}
