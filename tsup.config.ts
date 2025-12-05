import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/run': 'bin/run.ts',
    'src/lighthouse/lighthouse-worker': 'src/lighthouse/lighthouse-worker.ts',
    'src/index': 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  target: 'node18',
})
