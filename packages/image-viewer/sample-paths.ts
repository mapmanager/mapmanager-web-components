import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `cs_project/` when this repo sits next to `cloudscope-data/`. */
const csProjectRoot = fileURLToPath(new URL('../../../', import.meta.url))

const defaultRoot = resolve(
  csProjectRoot,
  'cloudscope-data/ome-zarr-output/manning-velocity-20260625-v2.ome.zarr',
)

/** Vite middleware prefix. Same idea as CloudScope Web `/__dev_collection__/`. */
export const DEV_COLLECTION_PREFIX = '/__dev_collection__/'

/**
 * Collection-relative image groups (not the `.ome.zarr` root).
 * Matches CloudScope Web `childRoot = new URL(ome_zarr_path + '/', collectionRoot)`.
 */
export const SAMPLE_KYMO_REL = 'acq_images/acq_image_340'
export const SAMPLE_REFERENCE_REL = 'acq_images/acq_image_340/reference'

/** Local Manning OME-Zarr collection, or null when absent (CI). */
export function sampleZarrRoot(): string | null {
  return existsSync(defaultRoot) ? defaultRoot : null
}

export function sampleKymographPath(): string | null {
  const root = sampleZarrRoot()
  const path = root ? resolve(root, SAMPLE_KYMO_REL) : null
  return path && existsSync(path) ? path : null
}

export function sampleReferencePath(): string | null {
  const root = sampleZarrRoot()
  const path = root ? resolve(root, SAMPLE_REFERENCE_REL) : null
  return path && existsSync(path) ? path : null
}

/**
 * Join a collection base URL/path with a child image group.
 *
 * The Manning store root has no `ome.multiscales`; Viv must load the nested
 * image, not `*.ome.zarr/`.
 */
export function collectionChildUrl(collectionRoot: string, relativePath: string): string {
  if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    throw new Error('relativePath must be a collection-relative image group')
  }
  const root = collectionRoot.endsWith('/') ? collectionRoot : `${collectionRoot}/`
  return `${root}${relativePath.replace(/\/$/, '')}/`
}
