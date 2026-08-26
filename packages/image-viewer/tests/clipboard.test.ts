import { afterEach, describe, expect, it, vi } from 'vitest'

import { canvasToPngBlob, imageClipboardSupported, writePngToClipboard } from '../src/engine/clipboard'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image clipboard', () => {
  it('encodes a canvas as PNG', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const canvas = {
      toBlob: (callback: BlobCallback, type?: string) => {
        expect(type).toBe('image/png')
        callback(png)
      },
    } as HTMLCanvasElement
    await expect(canvasToPngBlob(canvas)).resolves.toBe(png)
  })

  it('reports and uses browser PNG clipboard support', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    class MockClipboardItem {
      static supports(type: string): boolean {
        return type === 'image/png'
      }

      constructor(readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal('window', { ClipboardItem: MockClipboardItem })
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', MockClipboardItem)

    const png = new Blob(['png'], { type: 'image/png' })
    expect(imageClipboardSupported()).toBe(true)
    await writePngToClipboard(png)
    expect(write).toHaveBeenCalledOnce()
  })
})
