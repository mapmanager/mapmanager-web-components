import { describe, expect, it } from 'vitest'

import { clampRange, translateRange, zoomRange } from '../src/renderers/uplot/pan'

describe('pan ranges', () => {
  it('translates without changing the visible span', () => {
    expect(translateRange({ min: 10, max: 20 }, 0.25)).toEqual({ min: 12.5, max: 22.5 })
  })

  it('clamps either edge to the complete recording range', () => {
    expect(clampRange({ min: -4, max: 6 }, { min: 0, max: 100 })).toEqual({ min: 0, max: 10 })
    expect(clampRange({ min: 96, max: 106 }, { min: 0, max: 100 })).toEqual({ min: 90, max: 100 })
  })

  it('uses the complete range when the viewport is already wider', () => {
    expect(clampRange({ min: -10, max: 110 }, { min: 0, max: 100 })).toEqual({ min: 0, max: 100 })
  })

  it('zooms around the pointer anchor', () => {
    expect(zoomRange({ min: 0, max: 100 }, 0.5, 0.25)).toEqual({ min: 12.5, max: 62.5 })
    expect(zoomRange({ min: 0, max: 100 }, 2, 0)).toEqual({ min: 0, max: 200 })
  })
})
