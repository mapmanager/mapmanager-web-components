import { describe, expect, it } from 'vitest'

import {
  SIGNAL_VIEWER_THEMES,
  cursorChange,
  defaultCursorState,
  resolveTraceStyle,
  signalViewerThemeVariables,
} from '../src/core'

describe('cursor state and trace styles', () => {
  it('reports B-A and D-C only for visible cursor pairs', () => {
    const cursors = defaultCursorState()
    cursors.a = { ...cursors.a, value: 1, visible: true }
    cursors.b = { ...cursors.b, value: 4, visible: true }
    expect(cursorChange('b', cursors)).toMatchObject({ changedId: 'b', deltaX: 3, deltaY: null })
  })

  it('centralizes trace defaults while preserving caller overrides', () => {
    expect(resolveTraceStyle(undefined, 0)).toMatchObject({ lineWidth: 2, markers: false })
    expect(resolveTraceStyle({ lineWidth: 4, markers: true }, 1)).toMatchObject({
      lineWidth: 4, markers: true,
    })
  })

  it('provides complete centralized light and dark palettes', () => {
    expect(Object.keys(SIGNAL_VIEWER_THEMES.light)).toEqual(Object.keys(SIGNAL_VIEWER_THEMES.dark))
    expect(SIGNAL_VIEWER_THEMES.light.background).not.toBe(SIGNAL_VIEWER_THEMES.dark.background)
    expect(signalViewerThemeVariables('light')).toMatchObject({
      '--sv-background': SIGNAL_VIEWER_THEMES.light.background,
      '--sv-selection': SIGNAL_VIEWER_THEMES.light.selection,
    })
  })
})
