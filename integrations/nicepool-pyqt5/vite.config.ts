import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

interface PackageMetadata {
  name: string
  version: string
}

function nicePoolBuildInfo(): Plugin {
  const repositoryRoot = resolve(import.meta.dirname, '../..')
  const packageMetadata = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'),
  ) as PackageMetadata

  return {
    name: 'nicepool-build-info',
    closeBundle(): void {
      const repositoryCommit = execFileSync(
        'git',
        ['-C', repositoryRoot, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' },
      ).trim()
      const buildInfo = {
        schema_version: 1,
        repository_commit: repositoryCommit,
        frontend_package: packageMetadata.name,
        frontend_version: packageMetadata.version,
      }
      writeFileSync(
        resolve(
          import.meta.dirname,
          'src/nicepool_pyqt5/static/nicepool-build-info.json',
        ),
        `${JSON.stringify(buildInfo, null, 2)}\n`,
        'utf8',
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), nicePoolBuildInfo()],
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
