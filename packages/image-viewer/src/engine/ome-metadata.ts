/** Physical scale and units from OME-NGFF 0.4/0.5 or Viv-normalized metadata. */
export function parseOmeScale(metadata: unknown): {
  x: number
  y: number
  xUnit: string
  yUnit: string
} {
  const fallback = { x: 1, y: 1, xUnit: 'px', yUnit: 'px' }
  if (!metadata || typeof metadata !== 'object') return fallback
  const root = metadata as Record<string, unknown>
  const ome = isRecord(root.ome) ? root.ome : root
  const multiscales = asArray(ome.multiscales)
  const first = isRecord(multiscales[0]) ? multiscales[0] : null
  if (!first) return fallback
  const axes = asArray(first.axes)
  const datasets = asArray(first.datasets)
  const dataset = isRecord(datasets[0]) ? datasets[0] : null
  const transforms = asArray(dataset?.coordinateTransformations)
  const scaleTransform = transforms.find((item) => isRecord(item) && item.type === 'scale')
  const scale = isRecord(scaleTransform) ? asNumberArray(scaleTransform.scale) : []
  const yAxis = axisRecord(axes, 'y')
  const xAxis = axisRecord(axes, 'x')
  return {
    x: finiteOr(scale.at(-1), 1),
    y: finiteOr(scale.at(-2), 1),
    xUnit: stringOr(xAxis?.unit, 'px'),
    yUnit: stringOr(yAxis?.unit, 'px'),
  }
}

export function parseOmeContrast(metadata: unknown): [number, number] | null {
  if (!metadata || typeof metadata !== 'object') return null
  const root = metadata as Record<string, unknown>
  const omero = isRecord(root.omero)
    ? root.omero
    : isRecord(root.ome) && isRecord(root.ome.omero)
      ? root.ome.omero
      : null
  if (!omero) return null
  const channels = asArray(omero.channels)
  const window = isRecord(channels[0]) && isRecord(channels[0].window) ? channels[0].window : null
  if (!window) return null
  const start = typeof window.start === 'number' ? window.start : typeof window.min === 'number' ? window.min : null
  const end = typeof window.end === 'number' ? window.end : typeof window.max === 'number' ? window.max : null
  if (start === null || end === null || !(end > start)) return null
  return [start, end]
}

function axisRecord(axes: unknown[], name: string): Record<string, unknown> | null {
  for (const axis of axes) {
    if (isRecord(axis) && axis.name === name) return axis
    if (axis === name) return { name }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => Number(item)) : []
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : fallback
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
