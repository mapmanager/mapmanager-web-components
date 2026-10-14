import Papa from 'papaparse'

import type { ColumnSchema, DatasetInput, NicePoolPresetDefinition, NicePoolRow, NicePoolValue } from '../core/types'
import { sampleDataset } from './sampleData'

const LUO_CSV_URL = new URL('../../../../examples/nicepool/data/luo_et_al.csv', import.meta.url).href
const LUO_SCHEMA_URL = new URL('../../../../examples/nicepool/data/luo_et_al.json', import.meta.url).href

/** Complete dataset-aware initialization owned by the standalone demo host. */
export interface DemoDataset {
  dataset: DatasetInput
  presetDefinitions: readonly NicePoolPresetDefinition[]
  defaultPreset: string
}

const SYNTHETIC_PRESETS: readonly NicePoolPresetDefinition[] = [
  {
    name: 'Amplitude over time',
    state: {
      layout: '1x1',
      plots: [{ plotType: 'scatter', xColumn: 'time', yColumn: 'amplitude', colorColumn: 'condition' }],
    },
  },
  {
    name: 'Amplitude by condition',
    state: {
      layout: '1x1',
      plots: [{ plotType: 'swarm', xColumn: 'time', yColumn: 'amplitude', groupColumn: 'condition' }],
    },
  },
]

const LUO_PRESETS: readonly NicePoolPresetDefinition[] = [
  {
    name: 'Peak height by condition',
    state: {
      layout: '1x1',
      plots: [{
        plotType: 'swarm',
        preFilters: { include: 'yes' },
        xColumn: 'thresholdSec',
        yColumn: 'peakHeight',
        groupColumn: 'condition',
        showRaw: true,
        showMean: true,
        showErrorBars: true,
        errorBarType: 'sem',
      }],
    },
  },
]

/** Return the generated dataset without network or file parsing. */
export function syntheticDemoDataset(): DemoDataset {
  return {
    dataset: sampleDataset(),
    presetDefinitions: SYNTHETIC_PRESETS,
    defaultPreset: 'Amplitude over time',
  }
}

function parseSchema(value: unknown): readonly ColumnSchema[] {
  if (!Array.isArray(value)) throw new Error('Luo et al. schema must be an array')
  return value as readonly ColumnSchema[]
}

/** Parse caller-owned CSV text into NicePool records using its explicit schema. */
export function parseDemoCsv(csv: string, schema: readonly ColumnSchema[]): readonly NicePoolRow[] {
  const numericColumns = new Set(schema.filter(({ type }) => type === 'number').map(({ name }) => name))
  const expectedColumns = schema.map(({ name }) => name)
  const result = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: (column) => typeof column === 'string' && numericColumns.has(column),
  })
  if (result.errors.length) {
    const first = result.errors[0]!
    throw new Error(`CSV row ${first.row ?? 'unknown'}: ${first.message}`)
  }
  if (JSON.stringify(result.meta.fields ?? []) !== JSON.stringify(expectedColumns)) {
    throw new Error('Luo et al. CSV columns do not match its schema')
  }
  return result.data.map((source) => Object.fromEntries(expectedColumns.map((name) => {
    const value = source[name]
    return [name, value === '' || value === undefined ? null : value as NicePoolValue]
  })))
}

async function fetched(url: string, label: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${label}: HTTP ${response.status}`)
  return response
}

/** Load the tracked scientific table without adding CSV behavior to NicePool. */
export async function loadLuoDemoDataset(): Promise<DemoDataset> {
  const [csvResponse, schemaResponse] = await Promise.all([
    fetched(LUO_CSV_URL, 'Luo et al. CSV'),
    fetched(LUO_SCHEMA_URL, 'Luo et al. schema'),
  ])
  const [csv, schemaValue] = await Promise.all([csvResponse.text(), schemaResponse.json()])
  const schema = parseSchema(schemaValue)
  return {
    dataset: {
      rows: parseDemoCsv(csv, schema),
      rowIdColumn: 'row_id',
      schema,
      preFilterColumns: ['include', 'condition', 'sweep'],
      aggregation: {
        groupByColumn: 'file_number',
        preserveColumns: ['file', 'include', 'animal_id', 'species', 'region', 'cell_type', 'age', 'sex', 'genotype', 'condition', 'experiment'],
      },
    },
    presetDefinitions: LUO_PRESETS,
    defaultPreset: 'Peak height by condition',
  }
}
