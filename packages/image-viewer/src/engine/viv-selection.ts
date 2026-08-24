import type { PlaneSelection } from './types'

/** Viv selections omit y/x; extra t/c/z keys break YX-only loaders. */
export function vivSelection(
  labels: readonly string[],
  selection: PlaneSelection,
): Record<string, number> {
  const next: Record<string, number> = {}
  if (labels.includes('t')) next.t = selection.t
  if (labels.includes('c')) next.c = selection.c
  if (labels.includes('z')) next.z = selection.z
  return next
}

export function planeSelectionFrom(record: Record<string, number> | undefined): PlaneSelection {
  return {
    t: record?.t ?? 0,
    c: record?.c ?? 0,
    z: record?.z ?? 0,
  }
}
