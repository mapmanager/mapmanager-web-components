import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  resolve: {
    alias: {
      '@mapmanager/nicepool': resolve(import.meta.dirname, '../../packages/nicepool/src/public-api.ts'),
    },
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'src/nicepool_anywidget/static',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'frontend/widget.ts'),
      formats: ['es'],
      fileName: 'widget',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
})
