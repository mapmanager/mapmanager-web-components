export interface CopyViewRequest {
  sourceId: string
  pngDataUrl: string
  channels: number[]
}

/** Return whether this browser can write PNG images to the system clipboard. */
export function imageClipboardSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const clipboard = navigator.clipboard as Partial<Clipboard> | undefined
  return Boolean(
    typeof clipboard?.write === 'function' &&
      window.ClipboardItem &&
      (!ClipboardItem.supports || ClipboardItem.supports('image/png')),
  )
}

/** Encode a canvas as a PNG blob. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    )
  })
}

/** Encode a blob as a data URL for native-host clipboard bridges. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('PNG data URL encoding failed'))
    reader.readAsDataURL(blob)
  })
}

/** Write a PNG blob through the browser Clipboard API. */
export async function writePngToClipboard(blob: Blob): Promise<void> {
  if (!imageClipboardSupported()) {
    throw new Error('This browser does not support copying PNG images to the clipboard')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
