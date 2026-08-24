/**
 * Channel color LUTs for the viewer chrome and Viv layers.
 *
 * Solid tints use Viv `ColorPaletteExtension`. Gray / fire / viridis / magma
 * on a **single-channel** pane use `AdditiveColormapExtension` (`greys` /
 * `hot` / `viridis` / `magma`). Defaults stay green then magenta.
 */

export type LutName =
  | 'green'
  | 'magenta'
  | 'blue'
  | 'red'
  | 'cyan'
  | 'yellow'
  | 'gray'
  | 'fire'
  | 'viridis'
  | 'magma'

export const CHANNEL_LUTS: Record<LutName, [number, number, number]> = {
  green: [0, 220, 80],
  magenta: [255, 0, 220],
  blue: [80, 160, 255],
  red: [255, 80, 80],
  cyan: [0, 220, 220],
  yellow: [255, 220, 0],
  gray: [255, 255, 255],
  fire: [255, 140, 0],
  viridis: [53, 183, 121],
  magma: [235, 90, 95],
}

export const LUT_ORDER: LutName[] = [
  'green',
  'magenta',
  'blue',
  'red',
  'cyan',
  'yellow',
  'gray',
  'fire',
  'viridis',
  'magma',
]

/** Viv `AdditiveColormapExtension` registry name, when the LUT is a colormap. */
export const VIV_COLORMAP: Partial<Record<LutName, string>> = {
  gray: 'greys',
  fire: 'hot',
  viridis: 'viridis',
  magma: 'magma',
}

const DEFAULT_LUTS: LutName[] = ['green', 'magenta']

export function lutNameFromRgb(rgb: readonly number[]): LutName {
  const found = LUT_ORDER.find((name) => {
    const color = CHANNEL_LUTS[name]
    return color[0] === rgb[0] && color[1] === rgb[1] && color[2] === rgb[2]
  })
  return found ?? 'green'
}

export function defaultChannelColor(index: number): [number, number, number] {
  const name = DEFAULT_LUTS[index] ?? LUT_ORDER[index % LUT_ORDER.length]
  if (!name) return [...CHANNEL_LUTS.green]
  return [...CHANNEL_LUTS[name]]
}

/**
 * Viv colormap name for a one-channel pane, or `null` to use a solid tint.
 *
 * Args:
 *   name: LUT selected in the channel header.
 *   channelCount: Channels drawn in this pane (composite stays palettes).
 *
 * Returns:
 *   A Viv colormap id, or `null`.
 */
export function vivColormapForPane(name: LutName, channelCount: number): string | null {
  if (channelCount !== 1) return null
  return VIV_COLORMAP[name] ?? null
}
