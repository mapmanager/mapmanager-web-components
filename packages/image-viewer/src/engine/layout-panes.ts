export type ViewerLayout = 'side' | 'stack' | 'single' | 'composite'

export interface PaneSlot {
  id: string
  channels: number[]
}

/**
 * Visible channel indexes for the current layout.
 *
 * Composite uses every channel in one pane. Single uses the selected channel.
 * Side/stack use one channel per pane.
 */
export function paneChannels(
  layout: ViewerLayout,
  channelCount: number,
  selectedChannel: number,
): number[] {
  if (channelCount <= 1 || layout === 'composite') {
    return Array.from({ length: Math.max(channelCount, 1) }, (_, channel) => channel)
  }
  if (layout === 'single') return [selectedChannel]
  return Array.from({ length: channelCount }, (_, channel) => channel)
}

/**
 * Independent pane slots for CSS layout. Side/stack: one pane per channel.
 * Single/composite: one pane.
 */
export function paneSlots(
  layout: ViewerLayout,
  channelCount: number,
  selectedChannel: number,
): PaneSlot[] {
  if ((layout === 'side' || layout === 'stack') && channelCount > 1) {
    return Array.from({ length: channelCount }, (_, channel) => ({
      id: `pane-${channel}`,
      channels: [channel],
    }))
  }
  return [{ id: 'pane-0', channels: paneChannels(layout, channelCount, selectedChannel) }]
}
