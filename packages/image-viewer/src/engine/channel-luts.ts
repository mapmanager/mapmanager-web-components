export type LutName = 'green' | 'magenta' | 'blue' | 'red' | 'cyan' | 'yellow'

export const CHANNEL_LUTS: Record<LutName, [number, number, number]> = {
  green: [0, 220, 80],
  magenta: [255, 0, 220],
  blue: [80, 160, 255],
  red: [255, 80, 80],
  cyan: [0, 220, 220],
  yellow: [255, 220, 0],
}

export const LUT_ORDER: LutName[] = ['green', 'magenta', 'blue', 'red', 'cyan', 'yellow']

export function lutNameFromRgb(rgb: readonly number[]): LutName {
  const found = LUT_ORDER.find((name) => {
    const color = CHANNEL_LUTS[name]
    return color[0] === rgb[0] && color[1] === rgb[1] && color[2] === rgb[2]
  })
  return found ?? 'green'
}

export function defaultChannelColor(index: number): [number, number, number] {
  const name = LUT_ORDER[index % LUT_ORDER.length]
  if (!name) return [...CHANNEL_LUTS.green]
  return [...CHANNEL_LUTS[name]]
}
