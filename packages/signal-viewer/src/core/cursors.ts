import type { SignalCursor, SignalCursorChange, SignalCursorId, SignalCursorState } from './types'

const CURSOR_COLORS: Record<SignalCursorId, string> = {
  a: '#facc15', b: '#f59e0b', c: '#4ade80', d: '#22c55e',
}

/** Create hidden default A/B/C/D cursor state. */
export function defaultCursorState(): SignalCursorState {
  return Object.fromEntries(
    (['a', 'b', 'c', 'd'] as const).map((id) => [
      id, { id, value: null, visible: false, color: CURSOR_COLORS[id] },
    ]),
  ) as SignalCursorState
}

/** Clone cursor state so renderer and caller mutations cannot leak inward. */
export function cloneCursorState(state: SignalCursorState): SignalCursorState {
  return Object.fromEntries(
    (['a', 'b', 'c', 'd'] as const).map((id) => [id, { ...state[id] }]),
  ) as SignalCursorState
}

/** Build the release-time callback payload, including B-A and D-C. */
export function cursorChange(
  changedId: SignalCursorId,
  state: SignalCursorState,
): SignalCursorChange {
  const cursors = cloneCursorState(state)
  return {
    changedId,
    cursors,
    deltaX: cursorDelta(cursors.a, cursors.b),
    deltaY: cursorDelta(cursors.c, cursors.d),
  }
}

function cursorDelta(first: SignalCursor, second: SignalCursor): number | null {
  return first.visible && second.visible && first.value != null && second.value != null
    ? second.value - first.value
    : null
}
