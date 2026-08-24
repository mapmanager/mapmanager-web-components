import vue from '@vitejs/plugin-vue'
import sirv from 'sirv'
import { defineConfig } from 'vitest/config'

import {
  DEV_COLLECTION_PREFIX,
  SAMPLE_KYMO_REL,
  SAMPLE_REFERENCE_REL,
  collectionChildUrl,
  sampleKymographPath,
  sampleReferencePath,
  sampleZarrRoot,
} from './sample-paths.ts'

const sampleRoot = sampleZarrRoot()
const kymo = sampleKymographPath()
const reference = sampleReferencePath()

const dedupe = [
  '@deck.gl/core',
  '@deck.gl/layers',
  '@deck.gl/geo-layers',
  '@deck.gl/mesh-layers',
  '@luma.gl/core',
  '@luma.gl/engine',
  '@luma.gl/webgl',
  '@luma.gl/shadertools',
  '@luma.gl/constants',
  '@luma.gl/gltf',
]

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'local-ome-zarr',
      apply: 'serve',
      configureServer(server) {
        if (!sampleRoot) return
        server.middlewares.use(
          DEV_COLLECTION_PREFIX.replace(/\/$/, ''),
          sirv(sampleRoot, { dev: true, etag: true }),
        )
      },
    },
  ],
  resolve: { dedupe },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  define: {
    __SAMPLE_KYMO_URL__: JSON.stringify(
      kymo ? collectionChildUrl(DEV_COLLECTION_PREFIX, SAMPLE_KYMO_REL) : '',
    ),
    __SAMPLE_REFERENCE_URL__: JSON.stringify(
      reference ? collectionChildUrl(DEV_COLLECTION_PREFIX, SAMPLE_REFERENCE_REL) : '',
    ),
  },
  test: { environment: 'node', exclude: ['e2e/**', 'node_modules/**', 'dist*/**'] },
})
