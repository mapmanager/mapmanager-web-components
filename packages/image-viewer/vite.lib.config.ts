import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    lib: {
      entry: resolve(import.meta.dirname, 'src/public-api.ts'),
      formats: ['es'],
      fileName: 'image-viewer-web',
    },
    rollupOptions: {
      external: [
        'vue',
        '@deck.gl/core',
        '@deck.gl/layers',
        '@deck.gl/geo-layers',
        '@vivjs/extensions',
        '@vivjs/layers',
        '@vivjs/loaders',
      ],
    },
  },
})
