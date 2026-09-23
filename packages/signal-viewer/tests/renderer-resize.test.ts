import { describe, expect, it, vi } from 'vitest'

import { resizeRendererToHost } from '../src/renderers/renderer-api'

describe('renderer host resizing', () => {
  it('uses the host dimensions available after application layout settles', () => {
    const resize = vi.fn()

    expect(resizeRendererToHost(
      { resize },
      { clientWidth: 720, clientHeight: 180 },
      640,
      300,
    )).toEqual({ width: 720, height: 180 })
    expect(resize).toHaveBeenCalledWith(720, 180)
  })

  it('retains prior dimensions while the host is temporarily collapsed', () => {
    const resize = vi.fn()

    expect(resizeRendererToHost(
      { resize },
      { clientWidth: 0, clientHeight: 0 },
      640,
      300,
    )).toEqual({ width: 640, height: 300 })
    expect(resize).toHaveBeenCalledWith(640, 300)
  })
})
