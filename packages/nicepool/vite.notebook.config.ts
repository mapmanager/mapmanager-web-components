import { resolve } from 'node:path'

import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'notebooks',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/core/index.ts'),
      formats: ['es'],
      fileName: 'nicepool-core',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
})
