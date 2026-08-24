export type ViewerLayout = 'side' | 'stack' | 'single' | 'composite'

export interface PaneViewSpec {
  id: string
  x: number | string
  y: number | string
  width: number | string
  height: number | string
}

/**
 * Visible channel indexes for the current layout.
 *
 * Composite and single use one pane. Side/stack use one pane per channel.
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

/** Deck.gl view boxes: one full view, or split side/stack. */
export function paneViews(layout: ViewerLayout, channelCount: number): PaneViewSpec[] {
  const split = (layout === 'side' || layout === 'stack') && channelCount > 1
  const count = split ? channelCount : 1
  if (count === 1) {
    return [{ id: 'ortho', x: 0, y: 0, width: '100%', height: '100%' }]
  }
  if (layout === 'side') {
    return Array.from({ length: count }, (_, index) => ({
      id: `pane-${index}`,
      x: `${(100 / count) * index}%`,
      y: 0,
      width: `${100 / count}%`,
      height: '100%',
    }))
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `pane-${index}`,
    x: 0,
    y: `${(100 / count) * index}%`,
    width: '100%',
    height: `${100 / count}%`,
  }))
}

export function panePixelSize(
  layout: ViewerLayout,
  channelCount: number,
  viewWidth: number,
  viewHeight: number,
): { width: number; height: number } {
  const views = paneViews(layout, channelCount)
  if (views.length <= 1) return { width: viewWidth, height: viewHeight }
  if (layout === 'side') return { width: viewWidth / views.length, height: viewHeight }
  return { width: viewWidth, height: viewHeight / views.length }
}
