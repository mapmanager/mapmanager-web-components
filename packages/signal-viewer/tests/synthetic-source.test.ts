import { describe, expect, it } from 'vitest'

import {
  SYNTHETIC_DURATION,
  SYNTHETIC_PERIOD,
  SyntheticSignalSource,
} from '../src/app/synthetic-source'

describe('signal-viewer demo datasets', () => {
  it('shows ten cycles across the full recording', () => {
    expect(SYNTHETIC_DURATION / SYNTHETIC_PERIOD).toBe(10)
  })

  it('switches source identity and waveform parameters by dataset', async () => {
    const first = new SyntheticSignalSource('recording-a')
    const second = new SyntheticSignalSource('recording-b')
    expect((await first.describe()).id).toBe('recording-a')
    expect((await second.describe()).id).toBe('recording-b')

    const result = await second.getRange({
      startSample: 100_000,
      stopSample: 100_002,
      targetPoints: 10,
      seriesIds: ['command'],
    })
    const series = result.series[0]
    expect(series?.kind).toBe('samples')
    if (series?.kind === 'samples') expect(Array.from(series.values)).toEqual([60, 60])
  })
})
