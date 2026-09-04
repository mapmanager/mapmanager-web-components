import type { SignalViewerTheme } from './types'

/** Complete visual palette shared by component chrome and renderer adapters. */
export interface SignalViewerThemeTokens {
  background: string
  text: string
  muted: string
  panel: string
  border: string
  input: string
  axis: string
  grid: string
  selection: string
  selectionBorder: string
}

/** Central theme definitions. Renderer adapters should not define their own palettes. */
export const SIGNAL_VIEWER_THEMES: Readonly<Record<SignalViewerTheme, SignalViewerThemeTokens>> = {
  dark: {
    background: '#020617', text: '#e2e8f0', muted: '#94a3b8', panel: 'rgb(15 23 42 / 96%)',
    border: '#475569', input: '#1e293b', axis: '#94a3b8', grid: 'rgba(100, 116, 139, 0.22)',
    selection: 'rgba(34, 211, 238, 0.16)', selectionBorder: 'rgba(34, 211, 238, 0.75)',
  },
  light: {
    background: '#ffffff', text: '#172033', muted: '#64748b', panel: 'rgb(248 250 252 / 97%)',
    border: '#94a3b8', input: '#f1f5f9', axis: '#475569', grid: 'rgba(100, 116, 139, 0.20)',
    selection: 'rgba(2, 132, 199, 0.14)', selectionBorder: 'rgba(2, 132, 199, 0.70)',
  },
}

/** Convert one theme into the CSS variables used by the Vue boundary. */
export function signalViewerThemeVariables(theme: SignalViewerTheme): Record<string, string> {
  const tokens = SIGNAL_VIEWER_THEMES[theme]
  return {
    '--sv-background': tokens.background,
    '--sv-text': tokens.text,
    '--sv-muted': tokens.muted,
    '--sv-panel': tokens.panel,
    '--sv-border': tokens.border,
    '--sv-input': tokens.input,
    '--sv-selection': tokens.selection,
    '--sv-selection-border': tokens.selectionBorder,
  }
}
