/** Lucide path subset used by toolbar chrome. Designs from lucide.dev (ISC). */

export type IconName =
  | 'columns-2'
  | 'rows-2'
  | 'square'
  | 'layers-3'
  | 'chart-column-decreasing'
  | 'check'
  | 'copy'
  | 'menu'
  | 'maximize-2'

export type IconNode = [tag: 'rect' | 'path' | 'line', attributes: Record<string, string | number>]

export const ICONS: Record<IconName, IconNode[]> = {
  'columns-2': [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M12 3v18' }],
  ],
  'rows-2': [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M3 12h18' }],
  ],
  square: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }]],
  'layers-3': [
    [
      'path',
      {
        d: 'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
      },
    ],
    ['path', { d: 'm22 12.5-9.17 4.17a2 2 0 0 1-1.66 0L2 12.5' }],
    ['path', { d: 'm22 17.5-9.17 4.17a2 2 0 0 1-1.66 0L2 17.5' }],
  ],
  'chart-column-decreasing': [
    ['path', { d: 'M13 17V9' }],
    ['path', { d: 'M18 17v-3' }],
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M8 17V5' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  copy: [
    ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }],
    ['path', { d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' }],
  ],
  menu: [
    ['path', { d: 'M4 12h16' }],
    ['path', { d: 'M4 6h16' }],
    ['path', { d: 'M4 18h16' }],
  ],
  'maximize-2': [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'm21 3-7 7' }],
    ['path', { d: 'm3 21 7-7' }],
    ['path', { d: 'M9 21H3v-6' }],
  ],
}
