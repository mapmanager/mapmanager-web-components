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
    target: 'chrome80',
    outDir: 'src/nicepool_pyqt5/static',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'frontend/main.ts'),
      formats: ['iife'],
      name: 'NicePoolPyQt5Frontend',
      fileName: () => 'nicepool-pyqt5.js',
      cssFileName: 'nicepool-pyqt5',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
})
