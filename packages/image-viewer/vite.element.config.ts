import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  resolve: {
    dedupe: [
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
    ],
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-element',
    lib: {
      entry: resolve(import.meta.dirname, 'src/element/auto-register.ts'),
      formats: ['es'],
      fileName: 'image-viewer-element',
    },
  },
})
